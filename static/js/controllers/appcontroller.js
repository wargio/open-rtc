/*
 * Open-RTC.
 * Copyright (C) 2013-2015 struktur AG
 * Copyright 2019 - deroad
 *
 * This file is part of Open-RTC.
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
define(["jquery", "angular", "underscore"], function($, angular, _) {

	// AppController
	return ["$scope", "$window", "appData", "userSettingsData", "$timeout", function($scope, $window, appData, userSettingsData, $timeout) {

		// Disable drag and drop.
		$($window).on("dragover dragenter drop", function(event) {
			event.preventDefault();
		});

		appData.set($scope);

		// User related scope data.
		$scope.authorizing = false;
		$scope.roomsHistory = [];
		$scope.defaults = {
			displayName: null,
			buddyPicture: null,
			message: null,
			settings: {
				videoQuality: "high",
				sendStereo: false,
				maxFrameRate: 20,
				defaultRoom: "",
				language: "",
				audioRenderToAssociatedSkin: true,
				videoCpuOveruseDetection: true,
				experimental: {
					enabled: false,
					audioEchoCancellation2: true,
					audioAutoGainControl2: true,
					audioNoiseSuppression2: true,
					audioTypingNoiseDetection: true,
					videoLeakyBucket: true,
					videoNoiseReduction: false,
					preferVideoSendCodecVP9: false
				},
				turn: {
					selectedRegion: null
				},
				sound: {
					incomingMessages: true,
					incomingCall: true,
					roomJoinLeave: false
				}
			}
		};
		$scope.master = angular.copy($scope.defaults);

		$scope.update = function(user) {
			$scope.master = angular.copy(user);
			if (appData.flags.connected) {
				$scope.updateStatus();
			}
			$scope.refreshWebrtcSettings();
			$scope.refreshSoundSettings();
		};

		$scope.reset = function() {
			$scope.user = angular.copy($scope.master);
		};

		$scope.loadUserSettings = function() {
			$scope.master = angular.copy($scope.defaults);
			var storedUser = userSettingsData.load();
			if (storedUser) {
				$scope.user = $.extend(true, {}, $scope.master, storedUser);
				$scope.user.settings = $.extend(true, {}, $scope.user.settings, $scope.master.settings, $scope.user.settings);
				$scope.update($scope.user);
				$scope.loadedUser = storedUser.displayName && true;
			} else {
				$scope.loadedUser = false;
			}
			$scope.roomsHistory = [];
			appData.e.triggerHandler("userSettingsLoaded", [$scope.loadedUser, $scope.user]);
			$scope.reset();
		};

		$scope.manualReloadApp = function(url) {
			appData.flags.manualUnload = true;
			if (url) {
				$window.location.href = url;
				$timeout(function() {
					appData.flags.manualUnload = false;
				}, 0);
			} else {
				$window.location.reload(true);
			}
		};

		$scope.$on("room.joined", function(event, roomName) {
			if (roomName) {
				_.pull($scope.roomsHistory, roomName);
				$scope.roomsHistory.unshift(roomName);
				if ($scope.roomsHistory.length > 15) {
					// Limit the history.
					$scope.roomsHistory = $scope.roomsHistory.splice(0, 15);
				}
			}
		});

		appData.e.on("authorizing", function(event, authorizing) {
			$scope.authorizing = !!authorizing;
		});

		$scope.reset(); // Call once for bootstrap.

	}];

});
