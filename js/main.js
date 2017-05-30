//wrap everything in a self-executing anonymous function to move to local scope
(function(){

var map,projection;
var params = {}; //object for storing filter params
var autocomplete; //used for updating the list
//Delay APIs
var airportsURL = 'http://144.92.235.47:4040/airports'
var routesURL = 'http://144.92.235.47:4040/routes'

//begin script when window loads
window.onload = setMap();

//set up choropleth map
function setMap(){

    //map frame dimensions
    var width = $("#mapDiv").innerWidth(),
        height =$("#mapDiv").innerHeight();

    //create new svg container for the map
    map = d3.select("#mapDiv")
        .append("svg")
        .attr("class", "map")
        .attr("width", width)
        .attr("height", height);

    //create Albers equal area conic projection
    projection = d3.geoAlbers()
        .center([-0.8, 39.96])
        .rotate([93.73, 0.91, 0])
        .parallels([35.68, 45.50])
        .scale(1750)
        .translate([width/2, height/2]);

    path = d3.geoPath()
        .projection(projection);

    //use d3.queue to parallelize asynchronous data loading
    d3.queue()
        .defer(d3.json, "data/states.topojson") //load background states
        .await(callback);

    function callback(error,states){
        //Translate the topojson
        var states_topo = topojson.feature(states, states.objects.collection);

        //Generate app
        setStateOverlay(states_topo, map, path);
        setParams();
        setFilterChangeEvents()
        populateAutocomplete();
        callAirports ();
    };
};

//add states to map
function setStateOverlay(states_topo, map, path){
    var states = map.append("path")
        .datum(states_topo)
        .attr("class", "states")
        .attr("d", path);
};

//create autocomplete for search
function populateAutocomplete(){
	input = document.getElementById("airport_search")
	autocomplete = new Awesomplete(input, {
		data: function (item, input) {
			return {label: item.origincode+" - "+item.originname, value:item.origincode};},
		minChars: 2,
		maxItems: 5
	});
	//Add events for displaying routes and clearing search window
	input.addEventListener('awesomplete-select', function (e) {
		console.log(e.value)
		callRoutes(e.target.value);
	}, false);
	input.addEventListener('awesomplete-selectcomplete', function (e) {
		this.selected = e.target.value;
		e.target.value = null;
	}, false);
}

//Set the params variables
function setParams(){
        params['type'] = $('input[name=proportional_symbol]:checked').val()
        params['fyr'] = $('#yearInput').val().split(",")[0]
        params['lyr'] = $('#yearInput').val().split(",")[1]
        params['fmth'] = $('#monthInput').val().split(",")[0]
        params['lmth'] = $('#monthInput').val().split(",")[1]
        params['fdow'] = $('#dayInput').val().split(",")[0]
        params['ldow'] = $('#dayInput').val().split(",")[1]
        params['delay'] = $('input[name=delay]:checked').val()
        params['airline'] = $("input[name=airline]:checked").map(function() {
			return parseInt(this.value);
		}).get();	
}

//Sets separate filter change events
function setFilterChangeEvents(){
	var changeTimer1=changeTimer2=changeTimer3=changeTimer4=changeTimer5=false;
	$("input[name=proportional_symbol]" ).on("change",function(){
		if(changeTimer1 !== false) clearTimeout(changeTimer1);
		changeTimer1 = setTimeout(function(){
			params['type'] = $('input[name=proportional_symbol]:checked').val()
			callAirports();
			changeTimer1 = false;
		},50);
	});
	$("#yearInput,#monthInput,#dayInput" ).on("change",function(){
		if(changeTimer2 !== false) clearTimeout(changeTimer2);
		changeTimer2 = setTimeout(function(){
			params['fyr'] = $('#yearInput').val().split(",")[0]
        	params['lyr'] = $('#yearInput').val().split(",")[1]
        	params['fmth'] = $('#monthInput').val().split(",")[0]
        	params['lmth'] = $('#monthInput').val().split(",")[1]
        	params['fdow'] = $('#dayInput').val().split(",")[0]
        	params['ldow'] = $('#dayInput').val().split(",")[1]
			callAirports();
			changeTimer2 = false;
		},200);
	});
	$("input[name=delay]" ).on("change",function(){
		if(changeTimer3 !== false) clearTimeout(changeTimer3);
		changeTimer3 = setTimeout(function(){
			params['delay'] = $('input[name=delay]:checked').val()
			callAirports();
			changeTimer3 = false;
		},50);
	});
	$("input[name=airline]" ).on("change",function(){
		if(changeTimer4 !== false) clearTimeout(changeTimer4);
		changeTimer4 = setTimeout(function(){
			params['airline'] = $("input[name=airline]:checked").map(function() {
				return parseInt(this.value);
			}).get();
			callAirports();
			changeTimer4 = false;
		},200);
	});
	$(".resetter" ).on("click",function(){
		if(changeTimer5 !== false) clearTimeout(changeTimer5);
		changeTimer5 = setTimeout(function(){
			setParams();
			callAirports();
			changeTimer5 = false;
		},50);
	});
}

function callAirports (){
	//Do ajax call
	$.ajax({
        url: airportsURL,
        data: {
            type: params.type,
            fyr: params.fyr,
            lyr: params.lyr,
            fmth: params.fmth,
            lmth: params.lmth,
            fdow: params.fdow,
            ldow: params.ldow,
            airlines: eval(params.airline).join(",")
        },
        error: function() {
            console.log("error");
        },
        dataType: 'json',
        success: function(data) {
            updateAirportDelays(data.data,params.delay,params);
            autocomplete.list = data.data;
        },
        type: 'GET'
    });	
}

function callRoutes(destination){
	$.ajax({
		url: routesURL,
		data: {
			type: params.type,
			fyr: params.fyr,
			lyr: params.lyr,
			fmth: params.fmth,
			lmth: params.lmth,
			fdow: params.fdow,
			ldow: params.ldow,
			airlines: eval(params.airline).join(","),
			dest: destination
		},
		error: function() {
			console.log("error");
		},
		dataType: 'json',
		success: function(data) {
			drawLinesOut();
			lines(data)
		},
		type: 'GET'
	});
}

function updateAirportDelays(airports,delayType,params){
	for (i = 0; i < airports.length; i++) {
		var location = [+airports[i].lng, +airports[i].lat]
		var position = projection(location)
		airports[i]["position"] = position
	}

	map.selectAll("svg#circles").remove();
	var circles = map.append("svg")
		.attr("id", "circles");

	circles.selectAll(".circles")
		.data(airports)
		.enter()
		.append("circle")
			.attr("class", function(d) { return ("airports_" + d.origincode)})
			.attr('cx', function(d) { return d.position[0]})
			.attr('cy', function(d) { return d.position[1]})
			.attr("r", function(d) { return d.stats.delayed/3;})
			.style("fill",'blue')
			.style("fill-opacity",'0.5')
			//Add airport events for click and highlight
			.on("click", function (d) {
				callRoutes(d.origincode);
			})
			.on("mouseover", function(d){
				highlightAirport(d.origincode);
			})
			.on("mouseout", function(d){
				dehighlightAirport(d.origincode)
			})
          //.on("mousemove", moveLabel);
      // select all the airport circles
      var airports = circles.selectAll("circle")
      airports.append("desc")
          .text('{"fill": "blue", "stroke-width": "0.5px", "stroke-opacity": "0.65"}');
}

//function to highlight enumeration units and bars
function highlightAirport(code){

    //change stroke
    var selected = d3.selectAll(".airports_" + code)
        .style("fill", "#000080")
        .moveToFront();

    //call set label
    retrieveInfor(code);
    //changeChart(expressed,code,1,selected.style('fill'));
};

//function to get information window
function retrieveInfor(code){
    //label content
    var labelAttribute = "<h3>" + code + "</h3><b>total</b>";

    //create info label div
    var infolabel = d3.select("#row")
        .append("div")
        .attr("class", "infolabel")
        .attr("id", code + "_label")
        .html(labelAttribute);
};

//function to reset the element style on mouseout
function dehighlightAirport(code){
    var selected = d3.selectAll(".airports_" + code)
        .style("fill", function(){
            return getStyle(this, "fill")
        });

    d3.select(".infolabel")
        .remove();

    function getStyle(element, styleName){
        var styleText = d3.select(element)
            .select("desc")
            .text();

        var styleObject = JSON.parse(styleText);

        return styleObject[styleName];
    };
};

function moveLabel(){
    //get width of label
    var labelWidth = d3.select(".infolabel")
        .node()
        .getBoundingClientRect()
        .width;

    //use coordinates of mousemove event to set label coordinates
    var x1 = d3.event.clientX + 10,
        y1 = d3.event.clientY - 75,
        x2 = d3.event.clientX - labelWidth - 10,
        y2 = d3.event.clientY + 25;

    //horizontal label coordinate, testing for overflow
    var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
    //vertical label coordinate, testing for overflow
    var y = d3.event.clientY < 75 ? y2 : y1;

    d3.select(".infolabel")
        .style("left", x + "px")
        .style("top", y + "px");
};

function drawLinesOut(){
	//clear flow lines
	d3.selectAll(".arc").remove();
};

function lines(data){
	//draw flow lines
	var array = d3.values(data);
	//Create list containing only field_goal_attempts
	var origins = array[2];
	var min = d3.min(origins, function(d) {return d.stats.delayed});
	var max = d3.max(origins, function(d) {return d.stats.delayed});
	var domain = [min, max];
	var direction = "to"

	lineStroke = d3.scale.sqrt()
		.domain(domain)
    	.range([2, 12])

	//what follows is based on: http://bl.ocks.org/enoex/6201948
	var path = d3.geo.path()
		.projection(projection);

	// --- Helper functions (for tweening the path)
	var lineTransition = function lineTransition(path) {
 		path.transition()
 		//NOTE: Change this number (in ms) to make lines draw faster or slower
		.duration(1500)
		.attrTween("stroke-dasharray", tweenDash)
	};
	var tweenDash = function tweenDash() {
		//This function is used to animate the dash-array property, which is a
		//  nice hack that gives us animation along some arbitrary path (in this
		//  case, makes it look like a line is being drawn from point A to B)
		var len = this.getTotalLength();
		var interpolate = d3.interpolateString("0," + len, len + "," + len);
			return function(t) { return interpolate(t); };
	};

	var links = [];
	//var units = (viewToggle != "# of Shipments") ? data.units : "shipments"

	for(var i=0, len=origins.length; i<len; i++){
		// (note: loop until length - 1 since we're getting the next
		//  item with i+1)
		var coords = [[ origins[i].originlng, origins[i].originlat ],[ origins[i].desetlng, origins[i].destlat ]]
		var dl = origins[i].stats.delayed
		links.push({
			type: "LineString",
			coordinates: coords,
			total_delayed: dl,
 			origincode: origins[i].origincode,
			//units: units
		});
	}

	links.sort(function(a,b){return a.coordinates[0][0]-b.coordinates[0][0]});
	var xPosition //for managing directionality of flow lines

	var arcs = map.append("svg:g")
    	.attr("id", "arcs")
    	.attr("class", "arcs")
    	.moveToBack();

	arcs.selectAll("arc")
		.data(links)
		.enter()
		.append("path")
		.attr('class', function(d) { return ("arc " + d.origincode)})
		// .append("svg:arc")
		.style('fill', 'none')
		.attr("d", function(d){
			//http://bl.ocks.org/d3noob/
			var dx = projection(d.coordinates[0])[0] - projection(d.coordinates[1])[0],
				dy = projection(d.coordinates[0])[1] - projection(d.coordinates[1])[1],
				dr = Math.sqrt(dx * dx + dy * dy);

			var left = projection(d.coordinates[0])[0] < projection(d.coordinates[1])[0] ? true : false
			var sweep = left == true ? 1 : 0

			xPosition = projection(d.coordinates[0])[0]
			//sweep = 0
			return "M" +
			projection(d.coordinates[0])[0] + "," +
			projection(d.coordinates[0])[1] + "A" +
			dr + "," + dr + " 0 0," + sweep + " " +
			projection(d.coordinates[1])[0] + "," +
			projection(d.coordinates[1])[1]
		})
		// .style({'stroke': "#252525", "stroke-linejoin":"round", "cursor": "pointer"})
		.style('stroke-width', function(d) {return lineStroke(d.total_delayed)})
		.call(lineTransition);

  		var paths = d3.selectAll("path")
          .on("mouseover", function(d){
              highlightRoute(d.origincode);
          })
          .on("mouseout", function(d){
              dehighlightRoute(d.origincode)
          })
          //.on("mousemove", moveLabel)
          .append("desc")
          .text('{"stroke": "#252525"}');

		d3.select(".states")
		.moveToBack();
};

//function to highlight enumeration units and bars
function highlightRoute(code){

    //change stroke
    var selected = d3.selectAll("." + code)
        .style("stroke", "#000080")
        .moveToFront();

    //call set label
    retrieveRoute(code);
    //changeChart(expressed,code,1,selected.style('fill'));
};

//function to get information window
function retrieveRoute(code){
    //label content
    var labelAttribute = "<h3>" + code + "</h3><b>total</b>";

    //create info label div
    var infolabel = d3.select("#row")
        .append("div")
        .attr("class", "infolabel")
        .attr("id", code + "_label")
        .html(labelAttribute);
};

//function to reset the element style on mouseout
function dehighlightRoute(code){
    var selected = d3.selectAll("." + code)
        .style("stroke", function(){
            return getStyle(this, "stroke")
        });

    d3.select(".infolabel")
        .remove();

    function getStyle(element, styleName){
        var styleText = d3.select(element)
            .select("desc")
            .text();

        var styleObject = JSON.parse(styleText);

        return styleObject[styleName];
    };
};


	//range sliders
	$(".range-slider1").jRange({
		from:2014,
		to:2016,
		step:1,
		scale:[2014,2015,2016],
		width:230,
		showLabels:false,
		isRange:true,
		snap:true
	})

	$(".range-slider2").jRange({
		from:1,
		to:12,
		step:1,
		scale:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
		width:230,
		showLabels:false,
		isRange:true,
		snap:true
	})

	$(".range-slider3").jRange({
		from:1,
		to:7,
		step:1,
		scale:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
		width:230,
		showLabels:false,
		isRange:true,
		snap:true
	})

	//airline checkboxes
	$(document).ready(function() {
		var checkBoxes = $("input[name=airline]");
		checkBoxes.prop("checked", true);
	$(".check").click(function() {
		var checkBoxes = $("input[name=airline]");
		checkBoxes.prop("checked", !checkBoxes.prop("checked"));
		if (checkBoxes.prop("checked")){
			$(this).val("Uncheck All")}
		else{
			$(this).val("Check All")}
		});
	});

	//create grayout background
	d3.select(".container2")
		.append("div")
		.attr("class","grayOut col-md-12 col-lg-12 col-sm-12")
	//create intro window and fade out effect
	d3.select("body")
		.append("div").attr("class","OverviewBox col-md-12 col-lg-12 col-sm-12")
		.html("<span class='OverviewBoxTitle'><p>Welcome to U.S. Delay Flight Tracker</p></span><span class='OverviewBoxContent'><p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This interactive map is for exploring the temporal and spatial trends of delay domestic flights within the U.S. from 2014 to 2016. We believe that users will make better and smarter itinerary decisions by comparing the historic differences in delay frequencies between airlines.<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;To detect more insights, you can use the filters on the left-hand side to investigate information such as the percentage of delay flights per airport, average delay time per airport, delay patterns across time and airlines, types of flight delay, etc. If you want to get a more intuitive guide on how to use this map, please watch this <a href='tutorial.html' target='_blank'>tutorial</a>.</p></span>")
		.append("button").attr("class","OverviewButton")
		.text("Click Here to Enter the Map")
		.on("click",function(){
			$(".OverviewBox").fadeOut(350);
			$(".grayOut").fadeOut(350);
			$(".loader").show();
	})

	//create start page loader
	d3.select("body")
		.append("div")
		.attr("class","loader")
		.style("display","none")
	$(window).on("load",function(){
		setTimeout(removeLoader,5000)
	});
	function removeLoader(){
		$(".loader").fadeOut(3800,function(){
			$(".loader").remove();
		});
	}
	
	//display intro window and grayout background again when 'About' is clicked
	$(".menu-button1").on("click",function(){
		$(".OverviewBox").fadeIn(350)
		$(".grayOut").fadeIn(350)
	})

	//append button to contact window and set up fade out effect
	d3.select(".ContactBox")
		.append("button").attr("class","ContactButton")
		.text("Click Here to Enter the Map")
		.on("click",function(){
			$(".ContactBox").fadeOut(350);
			$(".grayOut").fadeOut(350);
		})
	
	//display contact window and grayout background again when 'Contact' is clicked
	$(".menu-button2").on("click",function(){
		$(".ContactBox").fadeIn(350)
		$(".grayOut").fadeIn(350)
	})
	
	//append button to tutorial window and set up fade out effect
		d3.select(".TutorialBox")
		.append("button").attr("class","TutorialButton")
		.text("Click Here to Enter the Map")
		.on("click",function(){
			$(".TutorialBox").fadeOut(350);
			$(".grayOut").fadeOut(350);
		})
	
	//display tutorial window and grayout background again when 'Tutorial' is clicked
	$(".foot-button1").on("click",function(){
		$(".TutorialBox").fadeIn(350)
		$(".grayOut").fadeIn(350)
	})
	
	//set up hover effect for resetter buttons
	$(".resetter").hover(function(){
		$(this).toggleClass('hovered')
		})

	//reset for proportional symbol filter
	$(".return_default1").on("click",function(){
		var radioButton1=$("input[id=percentage]");
		radioButton1.prop("checked",true);
	})

	//reset for time filter
	$(".return_default2").on("click",function(){
		var slider1=$("input[id=yearInput]");
		var slider2=$("input[id=monthInput]");
		var slider3=$("input[id=dayInput]");
		slider1.jRange("setValue", "2014,2015");
		slider2.jRange("setValue","0,6");
		slider3.jRange("setValue","1,4");
	})

	//reset for delay filter
	$(".return_default3").on("click",function(){
		var showAllButton=$("input[id=all]");
		showAllButton.prop("checked",true);
	})

	//reset for airline filter
	$(".return_default4").on("click",function(){
		var checkBoxes = $("input[name=airline]");
		checkBoxes.prop("checked",true);
	})
})();
