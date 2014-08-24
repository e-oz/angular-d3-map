AngularJS directive to draw interactive D3 map
==============================================
##Attributes

 - mapWidth, mapHeight - sizes of map, if fixed sizes are required
 - widthScale, heightScale - scales coefficients (when size is not fixed)
 - leftOffset, ..., bottomOffset - offsets in percents
 - scale - initial scale of map
 - pointClass - css class for 'circle' objects
 - circleRadius - default radius of 'circle' objects (when 'r' property is undefined)
 - areaClass - css class for map area
 - activeClass - css class for zoomed map area
 - zoomEmptyAreas - if we should zoom areas where getMap returned no objects
 - zoomXscale, zoomYscale - scale coefficients on zoom
 - textFontSize - font size for 'text' objects
 - textClass - css class for 'text' objects
 - textFont - font family for 'text' objects
 - getMap - function, will be called on map initialization and on each map area click, and to use it you should return promise (angular.$q) where result of promise is array of objects, and each object contain fields:
    - nested objects will be read from 'objects' field
    - type of objects will be read from 'type' field
    - getID function (if declared) will be read from getID field and will be called to define ID of each element
    - getContent function (if declared) will be read from getContent field and will be called to fill contents of 'div' or 'text' elements
    - nodeHandler function (if declared) will be read from nodeHandler field and will be called after all objects added, with arguments nodeHandler(nodes, nodesParent, projection).
    	Supported object types are 'path' (default), 'circle', 'div' and 'text'.
		In nodeHandler() you can declare any attributes and event-handlers for objects.
