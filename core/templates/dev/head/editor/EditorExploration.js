// Copyright 2012 Google Inc. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Controllers for an editor's main exploration page.
 *
 * @author sll@google.com (Sean Lip)
 */

var END_DEST = 'END';
var QN_DEST_PREFIX = 'q-';
var NONEXISTENT_STATE = '[none]';

// TODO(sll): Move all strings to the top of the file and internationalize them.
// TODO(sll): console.log is not supported in IE.

// Receive events from the iframed widget repository.
oppia.run(function($rootScope) {
  window.addEventListener('message', function(evt) {
    $rootScope.$broadcast('message', evt);
  });
});

function EditorExploration($scope, $http, $location, $anchorScroll, $modal,
    $filter, explorationData, warningsData, activeInputData) {

  $scope.doesStateIdExist = function() {
    return Boolean($scope.stateId);
  };

  /********************************************
  * Methods affecting the URL location hash.
  ********************************************/
  $scope.mainTabActive = false;
  $scope.statsTabActive = false;
  $scope.guiTabActive = false;

  $scope.location = $location;

  var GUI_EDITOR_URL = '/gui';
  var STATS_VIEWER_URL = '/stats';
  var firstLoad = true;

  $scope.selectMainTab = function() {
    // This is needed so that if a state id is entered in the URL,
    // the first tab does not get selected automatically, changing
    // the location to '/'.
    if (firstLoad) {
      firstLoad = false;
    } else {
      $location.path('/');
    }
  };

  $scope.selectStatsTab = function() {
    $location.path('/stats');
  };

  $scope.selectGuiTab = function() {
    $location.path('/gui/' + $scope.stateId);
  };

  $scope.$watch(function() {
    return $location.path();
  }, function(path) {
    console.log('Path is now ' + path);

    if (path.indexOf('/gui/') != -1) {
      $scope.stateId = path.substring('/gui/'.length);
      if (!$scope.stateId) {
        $location.path('/');
        return;
      }
      var promise = explorationData.getStateData($scope.stateId);
      if (!promise) {
        return;
      }
      promise.then(function(stateData) {
        if (!stateData) {
          // This state does not exist. Redirect to the exploration page.
          $location.path('/');
          return;
        } else {
          $scope.guiTabActive = true;
          $scope.statsTabActive = false;
          $scope.mainTabActive = false;
          $scope.$broadcast('guiTabSelected', stateData);
          // Scroll to the relevant element (if applicable).
          // TODO(sfederwisch): Change the trigger so that there is exactly one
          // scroll action that occurs when the page finishes loading.
          setTimeout(function () {
            if ($location.hash()) {
              $anchorScroll();
            }
            if (firstLoad) {
              firstLoad = false;
            }
          }, 1000);
        }
      });
    } else if (path == STATS_VIEWER_URL) {
      $location.hash('');
      explorationData.stateId = '';
      $scope.stateId = '';
      $scope.statsTabActive = true;
      $scope.mainTabActive = false;
      $scope.guiTabActive = false;
    } else {
      $location.path('/');
      $location.hash('');
      explorationData.stateId = '';
      $scope.stateId = '';
      $scope.mainTabActive = true;
      $scope.guiTabActive = false;
      $scope.statsTabActive = false;
    }
  });

  /********************************************
  * Methods affecting the graph visualization.
  ********************************************/
  $scope.drawGraph = function() {
    $scope.graphData = $scope.reformatResponse(
        $scope.states, $scope.initStateId);
  };

  $scope.isEndStateReachable = function() {
    if (!$scope.graphData) {
      return true;
    }
    for (var i = 0; i < $scope.graphData.nodes.length; i++) {
      if ($scope.graphData.nodes[i].name == END_DEST) {
        return $scope.graphData.nodes[i].reachable;
      }
    }
    return true;
  };


  /**********************************************************
   * Called on initial load of the exploration editor page.
   *********************************************************/
  var explorationFullyLoaded = false;

  // The pathname should be: .../create/{exploration_id}[/{state_id}]
  $scope.explorationId = pathnameArray[2];
  $scope.explorationUrl = '/create/' + $scope.explorationId;
  $scope.explorationDataUrl = '/create/' + $scope.explorationId + '/data';

  // Initializes the exploration page using data from the backend.
  explorationData.getData().then(function(data) {
    $scope.currentUserIsAdmin = data.is_admin;
    $scope.stateId = explorationData.stateId;
    $scope.states = data.states;
    $scope.explorationTitle = data.title;
    $scope.explorationCategory = data.category;
    $scope.explorationEditors = data.editors;
    $scope.initStateId = data.init_state_id;
    $scope.isPublic = data.is_public;
    $scope.currentUser = data.user;
    $scope.paramSpecs = data.param_specs || {};
    $scope.explorationParamChanges = data.param_changes || [];

    $scope.explorationSnapshots = [];
    for (var i = 0; i < data.snapshots.length; i++) {
      $scope.explorationSnapshots.push({
        'committerId': data.snapshots[i].committer_id,
        'createdOn': data.snapshots[i].created_on,
        'commitMessage': data.snapshots[i].commit_message,
        'versionNumber': data.snapshots[i].version_number
      });
    }

    $scope.stats = {
      'numVisits': data.num_visits,
      'numCompletions': data.num_completions,
      'stateStats': data.state_stats,
      'imp': data.imp
    };

    $scope.chartData = [
      ['', 'Completions', 'Non-completions'],
      ['', data.num_completions, data.num_visits - data.num_completions]
    ];
    $scope.chartColors = ['green', 'firebrick'];
    $scope.ruleChartColors = ['cornflowerblue', 'transparent'];

    $scope.statsGraphOpacities = {};
    $scope.statsGraphOpacities['legend'] = 'Students entering state';
    for (var stateId in $scope.states) {
      var visits = $scope.stats.stateStats[stateId].firstEntryCount;
      $scope.statsGraphOpacities[stateId] = Math.max(
          visits / $scope.stats.numVisits, 0.05);
    }
    $scope.statsGraphOpacities[END_DEST] = Math.max(
        $scope.stats.numCompletions / $scope.stats.numVisits, 0.05);

    $scope.highlightStates = {};
    $scope.highlightStates['legend'] = '#EE8800:Needs more feedback,brown:May be confusing';
    for (var j = 0; j < data.imp.length; j++) {
      if (data.imp[j].type == 'default') {
        $scope.highlightStates[data.imp[j].state_id] = '#EE8800';
      }
      if (data.imp[j].type == 'incomplete') {
        $scope.highlightStates[data.imp[j].state_id] = 'brown';
      }
    }

    $scope.drawGraph();

    explorationFullyLoaded = true;
  });

  $scope.canEditEditorList = function() {
    return ($scope.currentUser == $scope.explorationEditors[0] ||
            $scope.currentUserIsAdmin);
  };

  $scope.$watch('explorationCategory', function(newValue, oldValue) {
    // Do not save on the initial data load.
    if (oldValue !== undefined) {
      $scope.saveExplorationProperty(
          'explorationCategory', 'category', newValue, oldValue);
    }
  });

  $scope.reformatResponse = function(states, initStateId) {
    var SENTINEL_DEPTH = 3000;
    var VERT_OFFSET = 20;
    var HORIZ_SPACING = 150;
    var VERT_SPACING = 100;
    var HORIZ_OFFSET = 100;
    var nodes = {};
    var state;
    nodes[END_DEST] = {
      name: END_DEST,
      depth: SENTINEL_DEPTH,
      reachable: false,
      reachableFromEnd: false
    };
    for (state in states) {
      nodes[state] = {
        name: states[state].name,
        depth: SENTINEL_DEPTH,
        reachable: false,
        reachableFromEnd: false
      };
    }
    nodes[initStateId].depth = 0;

    var maxDepth = 0;
    var seenNodes = [initStateId];
    var queue = [initStateId];
    var maxXDistPerLevel = {0: HORIZ_OFFSET};
    nodes[initStateId].y0 = VERT_OFFSET;
    nodes[initStateId].x0 = HORIZ_OFFSET;

    var handlers, ruleSpecs, h, i;

    while (queue.length > 0) {
      var currNode = queue[0];
      queue.shift();
      nodes[currNode].reachable = true;
      if (currNode in states) {
        handlers = states[currNode].widget.handlers;
        for (h = 0; h < handlers.length; h++) {
          ruleSpecs = handlers[h].rule_specs;
          for (i = 0; i < ruleSpecs.length; i++) {
            // Assign levels to nodes only when they are first encountered.
            if (seenNodes.indexOf(ruleSpecs[i].dest) == -1) {
              seenNodes.push(ruleSpecs[i].dest);
              nodes[ruleSpecs[i].dest].depth = nodes[currNode].depth + 1;
              nodes[ruleSpecs[i].dest].y0 = (nodes[currNode].depth + 1) * VERT_SPACING + VERT_OFFSET;
              if (nodes[currNode].depth + 1 in maxXDistPerLevel) {
                nodes[ruleSpecs[i].dest].x0 = maxXDistPerLevel[nodes[currNode].depth + 1] + HORIZ_SPACING;
                maxXDistPerLevel[nodes[currNode].depth + 1] += HORIZ_SPACING;
              } else {
                nodes[ruleSpecs[i].dest].x0 = HORIZ_OFFSET;
                maxXDistPerLevel[nodes[currNode].depth + 1] = HORIZ_OFFSET;
              }
              maxDepth = Math.max(maxDepth, nodes[currNode].depth + 1);
              queue.push(ruleSpecs[i].dest);
            }
          }
        }
      }
    }

    // Handle nodes that have not been visited in the forward traversal.
    var horizPositionForLastRow = HORIZ_OFFSET;
    var node;
    for (node in nodes) {
      if (nodes[node].depth == SENTINEL_DEPTH) {
        nodes[node].depth = maxDepth + 1;
        nodes[node].y0 = VERT_OFFSET + nodes[node].depth * VERT_SPACING;
        nodes[node].x0 = horizPositionForLastRow;
        horizPositionForLastRow += HORIZ_SPACING;
      }
    }

    // Assign unique IDs to each node.
    var idCount = 0;
    var nodeList = [];
    for (node in nodes) {
      var nodeMap = nodes[node];
      nodeMap['hashId'] = node;
      nodeMap['id'] = idCount;
      nodes[node]['id'] = idCount;
      idCount++;
      nodeList.push(nodeMap);
    }

    var links = [];
    for (state in states) {
      handlers = states[state].widget.handlers;
      for (h = 0; h < handlers.length; h++) {
        ruleSpecs = handlers[h].rule_specs;
        for (i = 0; i < ruleSpecs.length; i++) {
          links.push({
            source: nodeList[nodes[state].id],
            target: nodeList[nodes[ruleSpecs[i].dest].id],
            name: $filter('parameterizeRuleDescription')(ruleSpecs[i])
          });
        }
      }
    }

    // Mark nodes that are reachable from the END state via backward links.
    queue = [END_DEST];
    nodes[END_DEST].reachableFromEnd = true;
    while (queue.length > 0) {
      var currNodeId = queue[0];
      queue.shift();

      for (i = 0; i < links.length; i++) {
        if (links[i].target.hashId == currNodeId &&
            !links[i].source.reachableFromEnd) {
          links[i].source.reachableFromEnd = true;
          queue.push(links[i].source.hashId);
        }
      }
    }

    return {nodes: nodeList, links: links, initStateId: initStateId};
  };


  $scope.$watch('explorationTitle', function(newValue, oldValue) {
    // Do not save on the initial data load.
    if (oldValue !== undefined) {
      $scope.saveExplorationProperty(
          'explorationTitle', 'title', newValue, oldValue);
    }
  });


  $scope.addExplorationParamSpec = function(name, type, successCallback) {
    console.log("adding parameter to exploration");
    if (name in $scope.paramSpecs) {
      warningsData.addWarning(
        'Parameter ' + name + ' already exists, so it was not added.');
      return;
    }

    $scope.paramSpecs[name] = {obj_type: type};
    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest({
          param_specs: $scope.paramSpecs,
          version: explorationData.data.version
        }),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              console.log('PUT request succeeded');
              explorationData.data.version = data.version;
              if (successCallback) {
                successCallback();
              }
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error adding parameter: ' + data.error);
              delete $scope.paramSpecs[name];
            });
  };

  $scope.openAddNewEditorForm = function() {
    activeInputData.name = 'explorationMetadata.addNewEditor';
  };

  $scope.closeAddNewEditorForm = function() {
    $scope.newEditorEmail = '';
    activeInputData.name = 'explorationMetadata';
  };

  $scope.addNewEditor = function(newEditorEmail) {
    activeInputData.name = 'explorationMetadata';
    $scope.explorationEditors.push(newEditorEmail);

    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest({
          editors: $scope.explorationEditors,
          version: explorationData.data.version
        }),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              console.log('PUT request succeeded');
              explorationData.data.version = data.version;
            }).
            error(function(data) {
              warningsData.addWarning(
                  'Error adding collaborator: ' + data.error);
              $scope.explorationEditors.pop();
            });
  };

  /**
   * Downloads the YAML representation of an exploration.
   */
  $scope.downloadExploration = function() {
    document.location = '/create/download/' + $scope.explorationId;
  };

  $scope.makePublic = function() {
    $scope.saveExplorationProperty('isPublic', 'is_public', true, false);
  };

  $scope.saveExplorationParamChanges = function() {
    $scope.saveExplorationProperty(
      'explorationParamChanges', 'param_changes',
      $scope.explorationParamChanges, null);
  };

  /**
   * Saves a property of an exploration (e.g. title, category, etc.)
   * @param {string} frontendName The frontend name of the property to save
   *     (e.g. explorationTitle, explorationCategory)
   * @param {string} backendName The backend name of the property (e.g. title, category)
   * @param {string} newValue The new value of the property
   * @param {string} oldValue The previous value of the property
   */
  $scope.saveExplorationProperty = function(frontendName, backendName, newValue, oldValue) {
    if (!explorationFullyLoaded) {
      return;
    }
    newValue = $scope.normalizeWhitespace(newValue);
    if (oldValue && !$scope.isValidEntityName(newValue, true)) {
      $scope[frontendName] = oldValue;
      return;
    }
    var requestParameters = {};
    requestParameters[backendName] = newValue;
    requestParameters['version'] = explorationData.data.version;

    $http.put(
        $scope.explorationDataUrl,
        $scope.createRequest(requestParameters),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              if (frontendName == 'isPublic') {
                $scope[frontendName] = newValue;
              }
              console.log('PUT request succeeded');
              explorationData.data.version = data.version;
            }).
            error(function(data) {
              console.log('ERROR');
              warningsData.addWarning(
                  'Error modifying exploration properties: ' + data.error);
              // TODO(sll): Reinstate the following line without causing the
              //     $watch to trigger.
              // $scope[frontendName] = oldValue;
            });
  };

  $scope.initializeNewActiveInput = function(newActiveInput) {
    // TODO(sll): Rework this so that in general it saves the current active
    // input, if any, first. If it is bad input, display a warning and cancel
    // the effects of the old change. But, for now, each case is handled
    // specially.
    console.log('Current Active Input: ' + activeInputData.name);
    if (activeInputData.name == 'stateName') {
      $scope.saveStateName();
    }

    var inputArray = newActiveInput.split('.');

    activeInputData.name = (newActiveInput || '');
    // TODO(sll): Initialize the newly displayed field.
  };

  // Adds a new state to the list of states, and updates the backend.
  $scope.addState = function(newStateName, successCallback) {
    newStateName = $scope.normalizeWhitespace(newStateName);
    if (!$scope.isValidEntityName(newStateName, true))
      return;
    if (newStateName.toUpperCase() == END_DEST) {
      warningsData.addWarning('Please choose a state name that is not \'END\'.');
      return;
    }
    for (var id in $scope.states) {
      if (id != $scope.stateId && $scope.states[id]['name'] == newStateName) {
        warningsData.addWarning('A state with this name already exists.');
        return;
      }
    }

    $http.post(
        $scope.explorationDataUrl,
        $scope.createRequest({
          state_name: newStateName,
          version: explorationData.data.version
        }),
        {headers: {'Content-Type': 'application/x-www-form-urlencoded'}}).
            success(function(data) {
              $scope.newStateDesc = '';
              $scope.states[data.stateData.id] = data.stateData;
              $scope.drawGraph();
              explorationData.data.version = data.version;
              if (successCallback) {
                successCallback(data.stateData.id);
              }
            }).error(function(data) {
              // TODO(sll): Actually force a refresh, since the data on the
              // page may be out of date.
              warningsData.addWarning(
                  'Server error when adding state: ' + data.error + '. ' +
                   'Please refresh your page.');
            });
  };

  $scope.getStateName = function(stateId) {
    return stateId ? explorationData.data.states[stateId].name : NONEXISTENT_STATE;
  };

  // Deletes the state with id stateId. This action cannot be undone.
  $scope.deleteState = function(stateId) {
    if (stateId == $scope.initStateId) {
      warningsData.addWarning('Deleting the initial state of a question is not ' +
          'supported. Perhaps edit it instead?');
      return;
    }

    if (stateId == NONEXISTENT_STATE) {
      warningsData.addWarning('No state with id ' + stateId + ' exists.');
      return;
    }

    $http['delete']($scope.explorationUrl + '/' + stateId + '/data')
    .success(function(data) {
      // Reloads the page.
      explorationData.data.version = data.version;
      window.location = $scope.explorationUrl;
    }).error(function(data) {
      warningsData.addWarning(data.error || 'Error communicating with server.');
    });
  };

  $scope.deleteExploration = function() {
    $http['delete']($scope.explorationDataUrl)
    .success(function(data) {
      window.location = '/gallery/';
    });
  };

  $scope.showDeleteExplorationModal = function() {
    warningsData.clear();

    var modalInstance = $modal.open({
      templateUrl: 'modals/deleteExploration',
      backdrop: 'static',
      controller: function($scope, $modalInstance) {
        $scope.delete = function() {
          $modalInstance.close();
        };

        $scope.cancel = function() {
          $modalInstance.dismiss('cancel');
          warningsData.clear();
        };
      }
    });

    modalInstance.result.then(function() {
      $scope.deleteExploration();
    }, function () {
      console.log('Delete exploration modal dismissed.');
    });
  };

  $scope.showDeleteStateModal = function(deleteStateId) {
    warningsData.clear();

    var modalInstance = $modal.open({
      templateUrl: 'modals/deleteState',
      backdrop: 'static',
      resolve: {
        deleteStateName: function() {
          return $scope.getStateName(deleteStateId);
        }
      },
      controller: function($scope, $modalInstance, deleteStateName) {
        $scope.deleteStateName = deleteStateName;

        $scope.delete = function() {
          $modalInstance.close({deleteStateId: deleteStateId});
        };

        $scope.cancel = function() {
          $modalInstance.dismiss('cancel');
          warningsData.clear();
        };
      }
    });

    modalInstance.result.then(function(result) {
      $scope.deleteState(result.deleteStateId);
    }, function () {
      console.log('Delete state modal dismissed.');
    });
  };
}

/**
 * Injects dependencies in a way that is preserved by minification.
 */
EditorExploration.$inject = [
  '$scope', '$http', '$location', '$anchorScroll', '$modal', '$filter',
  'explorationData', 'warningsData', 'activeInputData'
];
