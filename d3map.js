'use strict';

/**
 * @ngdoc directive
 * @description draw interactive map with D3
 *
 * mapWidth, mapHeight - sizes of map, if fixed sizes are required
 * widthScale, heightScale - scales coefficients (when size is not fixed)
 * leftOffset, ..., bottomOffset - offsets in percents
 * scale - initial scale of map
 * pointClass - css class for 'circle' objects
 * circleRadius - default radius of 'circle' objects (when 'r' property is undefined)
 * areaClass - css class for map area
 * activeClass - css class for zoomed map area
 * zoomEmptyAreas - if we should zoom areas where getMap returned no objects
 * zoomXscale, zoomYscale - scale coefficients on zoom
 * textFontSize - font size for 'text' objects
 * textClass - css class for 'text' objects
 * textFont - font family for 'text' objects
 * divClass - css class for 'div' objects
 * ctrlLink - link to object, which will receive method `addObjects`.
 *   arguments of the `addObjects` are similar to resolve() of getMap promise, and it's they way how you can
 *   add objects to the existing map dynamically
 *
 * getMap - function, will be called on map initialization and on each map area click, and
 *  to use it you should return promise (angular.$q) where result of promise
 *  is array of objects, and each object contain fields:
 *    nested objects will be read from 'objects' field
 *    type of objects will be read from 'type' field
 *    getID function (if declared) will be read from getID field and will be called to define ID of each element
 *    getContent function (if declared) will be read from getContent field and will be called to fill contents of 'div' or 'text' elements
 *    nodeHandler function (if declared) will be read from nodeHandler field and
 *      will be called after all objects added, with arguments nodeHandler(nodes, nodesParent, projection).
 * Supported object types are 'path' (default), 'circle', 'div' and 'text'.
 * In nodeHandler() you can declare any attributes and event-handlers for objects.
 */
angular.module('oz.d3Map', [])
  .directive('ozD3Map', function ($timeout, D3ChartSizer) {
    var xyz, g, projection, path, svg, width, height, objects, resizeBind;
    var stack = [];
    var sizer = new D3ChartSizer();

    function setDefaults(attrs) {
      attrs.widthScale = attrs.widthScale || '1.4';
      attrs.heightScale = attrs.heightScale || '1.5';
      attrs.leftOffset = attrs.leftOffset || '0';
      attrs.topOffset = attrs.topOffset || '0';
      attrs.rightOffset = attrs.rightOffset || '0';
      attrs.bottomOffset = attrs.bottomOffset || '0';
      attrs.scale = attrs.scale || '0.14';
      attrs.zoomXscale = attrs.zoomXscale || '1.8';
      attrs.zoomYscale = attrs.zoomYscale || '2.1';
      attrs.circleRadius = attrs.circleRadius || '2';
      if (attrs.zoomEmptyAreas === undefined) {
        attrs.zoomEmptyAreas = 'false';
      }
      attrs.textFontSize = attrs.textFontSize || '8px';
      attrs.textFont = attrs.textFont || 'sans-serif';
    }

    return {
      restrict: 'E',
      scope:    {
        mapWidth:       '@',
        mapHeight:      '@',
        widthScale:     '@',
        heightScale:    '@',
        leftOffset:     '@',
        topOffset:      '@',
        rightOffset:    '@',
        bottomOffset:   '@',
        scale:          '@',
        height:         '@',
        getMap:         '&',
        pointClass:     '@',
        activeClass:    '@',
        areaClass:      '@',
        zoomEmptyAreas: '@',
        zoomXscale:     '@',
        zoomYscale:     '@',
        circleRadius:   '@',
        textFontSize:   '@',
        textClass:      '@',
        textFont:       '@',
        divClass:       '@',
        ctrlLink:       '='
      },
      compile:  function (el, attrs) {
        setDefaults(attrs);
        return {
          post: function ($scope, $element) {
            if (!$scope.getMap || !angular.isFunction($scope.getMap)) {
              console.error('map getter not bound');
              return false;
            }
            svg = d3.select(angular.element($element)[0]).append('svg');
            g = svg.append('g');
            sizer.setSizes($scope, $element.parent());
            var originalScale = $scope.scale;

            drawMap();

            function drawMap() {
              stack = [];
              if (!$scope.widthScale && $scope.mapWidth) {
                $scope.widthScale = $scope.width/$scope.mapWidth;
              }
              if (!$scope.heightScale && $scope.mapHeight) {
                $scope.heightScale = $scope.height/$scope.mapHeight;
              }
              $scope.scale = originalScale*$scope.width;
              width = $scope.width;
              height = $scope.height;
              projection = d3.geo.mercator()
                .scale($scope.scale)
                .translate([width/$scope.widthScale, height/$scope.heightScale]);

              svg.attr('preserveAspectRatio', 'xMidYMid')
                .attr('viewBox', Math.round(($scope.leftOffset/100)*width) + ' ' + Math.round(($scope.topOffset/100)*height) + ' ' + Math.round(width*(1 - ($scope.rightOffset/100))) + ' ' + Math.round(height*(1 - ($scope.bottomOffset/100))))
                .attr('width', width)
                .attr('height', height);

              path = d3.geo.path().projection(projection);

              if (!objects) {
                $scope.getMap().then(function (newObjects) {
                  if (!newObjects) {
                    console.error('map objects empty');
                    return false;
                  }
                  objects = newObjects;
                  g.selectAll('g').remove();
                  addObjects(objects);
                });
              }
              else {
                g.selectAll('g').remove();
                addObjects(objects);
              }
            }

            function addObjects(objects) {
              if (angular.isArray(objects)) {
                angular.forEach(objects, function (subObjects) {
                  if (subObjects.objects) {
                    addObjects(subObjects);
                  }
                });
                return true;
              }
              var objectsType, nodes, nodeHandler;
              var getID = function (d) {return d.id;};
              var getContent = function (d) {return d.data;};
              if (!angular.isArray(objects) && angular.isArray(objects.objects)) {
                objectsType = objects.type;
                if (angular.isFunction(objects.getID)) {
                  getID = objects.getID;
                }
                if (angular.isFunction(objects.getContent)) {
                  getContent = objects.getContent;
                }
                nodeHandler = objects.nodeHandler;
                objects = objects.objects;
                if (!angular.isArray(objects)) {
                  console.error('d3-map: Expected array of objects or array of array of objects.', objects);
                  return false;
                }
              }
              var nodesParent = g.append('g');
              switch (objectsType) {
                case 'circle':
                  nodes = nodesParent
                    .attr('id', 'level' + parseInt(stack.length + 1))
                    .selectAll('path')
                    .data(objects)
                    .enter()
                    .append('circle')
                    .attr('r', function (d) {
                      return d.r || $scope.circleRadius;
                    })
                    .attr('id', getID)
                    .attr('class', $scope.pointClass)
                    .attr('transform', function (d) {
                      return 'translate(' + projection([
                          d.location.longitude,
                          d.location.latitude
                        ]) + ')';
                    });
                  break;
                case 'text':
                  nodes = nodesParent
                    .attr('id', 'level' + parseInt(stack.length + 1))
                    .selectAll('text')
                    .data(objects)
                    .enter()
                    .append('text')
                    .attr('transform', function (d) {
                      var centerCoordinates = projection([
                        d.location.longitude,
                        d.location.latitude
                      ]);
                      centerCoordinates[1] += parseFloat(parseInt($scope.textFontSize)/3);
                      return 'translate(' + centerCoordinates + ')';
                    })
                    .attr("font-family", $scope.textFont)
                    .attr("font-size", $scope.textFontSize)
                    .attr("class", $scope.textClass)
                    .text(getContent);
                  break;
                case 'div':
                  nodesParent = nodesParent.attr('id', 'level' + parseInt(stack.length + 1))
                    .append('foreignObject').attr("width", width).attr("height", height);
                  nodes = nodesParent
                    .selectAll('div')
                    .data(objects)
                    .enter()
                    .append('xhtml:div')
                    .attr('style', function (d) {
                      var centerCoordinates = projection([
                        d.location.longitude,
                        d.location.latitude
                      ]);
                      var padding = parseFloat(parseInt($scope.textFontSize));
                      centerCoordinates[0] -= padding;
                      centerCoordinates[1] -= padding;
                      return 'position: absolute; left: ' + centerCoordinates[0] + 'px; top: ' + centerCoordinates[1] + 'px;';
                    })
                    .attr("class", $scope.divClass)
                    .html(getContent);
                  break;
                //case 'path':
                default:
                  var areaClass = $scope.areaClass;
                  if (stack.length > 0) {
                    areaClass = areaClass + $scope.activeClass;
                  }
                  nodes = nodesParent
                    .attr('id', 'level' + parseInt(stack.length + 1))
                    .selectAll('path')
                    .data(objects)
                    .enter()
                    .append('path')
                    .attr('id', getID)
                    .attr('class', areaClass)
                    .attr('d', path)
                    .on('click', function (d) {
                      mapClicked(d, stack.length);
                    });
              }
              if (angular.isFunction(nodeHandler)) {
                nodeHandler(nodes, nodesParent, projection);
              }
            }

            function mapClicked(area, fromLevel) {
              if (stack.length > 0) {
                var toRemove = g.selectAll('#level' + parseInt(stack.length + 1));
                if (toRemove) {
                  toRemove.remove();
                }
              }
              //if (stack[0]) {
              //  g.selectAll('#' + stack[0].id).style('display', null);
              //}
              if (area && (!stack[0] || stack[0].id !== area.id)) {
                xyz = getXyz(area);
                if (fromLevel <= stack.length) {
                  stack[0] = area;
                }
                else {
                  stack.unshift(area);
                }
                g.selectAll('.' + $scope.activeClass).classed($scope.activeClass, false);
                $scope.getMap({area: area, stack: stack}).then(function (mapObjects) {
                  addObjects(mapObjects);
                  zoom(xyz);
                  //g.selectAll('#' + area.id).style('display', 'none');
                }, function () {
                  if ($scope.activeClass) {
                    g.selectAll('#' + area.id).classed($scope.activeClass, true);
                  }
                  if ($scope.zoomEmptyAreas && $scope.zoomEmptyAreas !== 'false') {
                    zoom(xyz);
                  }
                });
              } else {
                stack.shift();
                xyz = [width/$scope.widthScale, height/$scope.heightScale, 1];
                if ($scope.activeClass) {
                  g.selectAll('.' + $scope.activeClass).classed($scope.activeClass, false);
                }
                zoom(xyz);
              }
            }

            function zoom(xyz) {
              g.transition()
                .duration(750)
                .attr('transform', 'translate(' + projection.translate() + ')scale(' + xyz[2] + ')translate(-' + xyz[0] + ',-' + xyz[1] + ')');
              if ($scope.pointClass) {
                g.selectAll('.' + $scope.pointClass)
                  .attr('d', path.pointRadius(20.0/xyz[2]));
              }
            }

            function getXyz(d) {
              var bounds = path.bounds(d);
              var wScale = (bounds[1][0] - bounds[0][0])/width;
              var hScale = (bounds[1][1] - bounds[0][1])/height;
              var z = 1/Math.max(wScale, hScale);
              var x = (bounds[1][0] + bounds[0][0])/$scope.zoomXscale;
              var y = (bounds[1][1] + bounds[0][1])/$scope.zoomYscale + (height/z/6);
              return [x, y, z];
            }

            if (!resizeBind) {
              resizeBind = true;
              $(window).resize(function () {
                var newHeight = $(window).height();
                var newWidth = $(window).width();
                $timeout(function () {
                  if ($(window).height() === newHeight && $(window).width() === newWidth) {
                    $scope.height = false;
                    $scope.width = false;
                    sizer.setSizes($scope, $element.parent());
                    drawMap();
                  }
                }, 200);
              });
            }

            if ($scope.ctrlLink && angular.isObject($scope.ctrlLink)) {
              $scope.ctrlLink.addObjects = addObjects;
            }
          }
        };
      }
    };
  });
