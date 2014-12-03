/*
 * Spreed WebRTC.
 * Copyright (C) 2013-2014 struktur AG
 *
 * This file is part of Spreed WebRTC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

"use strict";
define([
	'angular',
	'jquery',
	'underscore'
], function(angular, $, _) {

	return ["$window", "$location", "$timeout", "$q", "$route", "$rootScope", "$http", "globalContext", "safeApply", "connector", "api", "restURL", "roompin", "appData", "alertify", "translation", function($window, $location, $timeout, $q, $route, $rootScope, $http, globalContext, safeApply, connector, api, restURL, roompin, appData, alertify, translation) {
		var url = restURL.api("rooms");
		var requestedRoomName = "";
		var helloedRoomName = null;
		var currentRoom = null;
		var randomRoom = null;

		var joinFailed = function(error) {
			setCurrentRoom(null);

			switch(error.Code) {
			case "default_room_disabled":
				rooms.randomRoom();
				break;
			case "invalid_credentials":
				roompin.clear(requestedRoomName);
				/* falls through */
			case "authorization_required":
				roompin.requestInteractively(requestedRoomName).then(joinRequestedRoom,
				function() {
					console.log("Authentication cancelled, try a different room.");
					rooms.joinDefault();
				});
				break;
			case "authorization_not_required":
				roompin.clear(requestedRoomName);
				joinRequestedRoom();
				break;
			case "room_join_requires_account":
				console.log("Room join requires a logged in user.");
				alertify.dialog.notify("", translation._("Please sign in to create rooms."), function() {
					rooms.joinDefault();
				}, function() {
					rooms.joinDefault();
				});
				break;
			default:
				console.log("Unknown error", error, "while joining room ", requestedRoomName);
				break;
			}
		};

		var joinRequestedRoom = function() {
			if (appData.authorizing()) {
				// Do nothing while authorizing.
				return;
			}
			if (!connector.connected || !currentRoom || requestedRoomName !== currentRoom.Name) {
				if (requestedRoomName !== "" || globalContext.Cfg.DefaultRoomEnabled) {
					requestedRoomName = requestedRoomName ? requestedRoomName : "";
					if (helloedRoomName !== requestedRoomName) {
						console.log("Joining room", requestedRoomName);
						helloedRoomName = requestedRoomName;
						api.sendHello(requestedRoomName, roompin.get(requestedRoomName), function(room) {
							helloedRoomName = null;
							setCurrentRoom(room);
						}, function(error) {
							helloedRoomName = null;
							joinFailed(error);
						});
					}
				} else {
					console.log("Default room disabled, requesting a random room.");
					setCurrentRoom(null);
					rooms.randomRoom();
				}
			}
		};

		var setCurrentRoom = function(room) {
			if (room === currentRoom) {
				return;
			}
			var priorRoom = currentRoom;
			currentRoom = room;
			if (priorRoom) {
				console.log("Left room", priorRoom.Name);
				$rootScope.$broadcast("room.left", priorRoom.Name);
			}
			if (currentRoom) {
				console.log("Joined room", currentRoom.Name);
				$rootScope.$broadcast("room.joined", currentRoom.Name);
			}
		};

		var updateRoom = function(room) {
			var response = $q.defer();
			api.requestRoomUpdate(room, response.resolve, response.reject);
			return response.promise.then(applyRoomUpdate);
		};

		var applyRoomUpdate = function(room) {
			if (room.Credentials) {
				roompin.update(currentRoom.Name, room.Credentials.PIN);
				delete room.Credentials;
			}
			currentRoom = room;
			$rootScope.$broadcast("room.updated", currentRoom);
			return room;
		};

		connector.e.on("close error", function() {
			setCurrentRoom(null);
		});

		api.e.on("received.room", function(event, room) {
			applyRoomUpdate(room);
		});

		appData.e.on("authorizing", function(event, value) {
			if (!value) {
				// NOTE(lcooper): This will have been skipped earlier, so try again.
				_.defer(joinRequestedRoom);
			}
		});

		appData.e.on("selfReceived", function(event, data) {
			_.defer(joinRequestedRoom);
		});

		$rootScope.$on("$locationChangeSuccess", function(event) {
			var roomName;
			if ($route.current) {
				roomName = $route.current.params.room;
				roomName = $window.decodeURIComponent(roomName);
			} else {
				roomName = "";
			}
			requestedRoomName = roomName;
			if (connector.connected) {
				_.defer(joinRequestedRoom);
			} else {
				$rootScope.$broadcast("rooms.ready");
			}
		});

		var rooms = {
			inDefaultRoom: function() {
				return (currentRoom !== null ? currentRoom.Name : requestedRoomName) === "";
			},
			randomRoom: function() {
				$http({
					method: "POST",
					url: url,
					data: $.param({}),
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded'
					}
				}).
					success(function(data, status) {
						console.info("Retrieved random room data", data);
						if (!data.name) {
							data.name = "";
						}
						randomRoom = {name: data.name};
						$rootScope.$broadcast('room.random', randomRoom);
					}).
					error(function() {
						console.error("Failed to retrieve random room data.");
						randomRoom = {};
						$rootScope.$broadcast('room.random', randomRoom);
					});
			},
			getRandomRoom: function() {
				return randomRoom;
			},
			joinByName: function(name, replace) {
				name = $window.encodeURIComponent(name);
				name = name.replace(/^%40/, "@");
				name = name.replace(/^%24/, "$");
				name = name.replace(/^%2B/, "+");

				safeApply($rootScope, function(scope) {
					$location.path("/" + name);
					if (replace) {
						$location.replace();
					}
				});
				return name;
			},
			joinDefault: function(replace) {
				return rooms.joinByName("", replace);
			},
			link: function(room) {
				var name = room ? room.Name : null;
				if (!name) {
					name = "";
				}
				return restURL.room(name);
			},
			setPIN: function(pin) {
				pin = "" + pin;
				var newRoom = angular.copy(currentRoom);
				newRoom.Credentials = {PIN: pin};
				return updateRoom(newRoom).then(null, function(error) {
					console.log("Failed to set room PIN", error);
					return $q.reject(error);
				});
			}
		};

		// NOTE(lcooper): For debugging only, do not use this on production.
		$window.setRoomPIN = rooms.setPIN;

		return rooms;
    }];
});