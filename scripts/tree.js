var jsonPath = "json/" + "stark" + ".json";

var allNodes = [];
var publicTree;
var running = 1; // number of running asynchronous functions

function parseTree(tree, replace, level) {
	if (typeof replace != "undefined" && replace != null) {
		tree.children = replace.children;
		parseTree(tree, null, level);
		return;
	}
	if (tree.source) {
		running++;
		d3.json(tree.source, function (error, treeData) {
			running--;
			delete tree.source;
			parseTree(tree, treeData, level);
		});
		return;
	}
	if (tree.children) {
		if (!Array.isArray(tree.children))
			tree.children = [tree.children];

		$(tree.children).each(function () {
			this.parentNode = tree;
			if (tree.isMale)
				this.father = tree;
			else
				this.mother = tree;
			if (tree.marriedTo != null) {
				if (tree.marriedTo.isMale)
					this.father = tree.marriedTo;
				else
					this.mother = tree.marriedTo;
			}

			if (!this.surname1 && this.father)
				this.surname1 = this.father.surname1;
			if (!this.surname2 && this.mother)
				this.surname2 = this.mother.surname1;

			parseTree(this, null, level + 1);
		});
	} else if (tree.marriages) {
		if (!Array.isArray(tree.marriages))
			tree.marriages = [tree.marriages];

		$(tree.marriages).each(function () {
			this.parentNode = tree;
			this.isMarriage = true;
			this.marriedTo = tree;
			parseTree(this, null, level + 1);
		});
		tree.children = tree.marriages;
	}

	if (level > 7 && tree.children != null && tree.isMarriage) {
		tree._children = tree.children;
		delete tree.children;
	}
	tree.nameAndSurname = (tree.fullName ? tree.fullName : tree.name) + (tree.surname1 ? ' ' + tree.surname1 + (tree.surname2 ? ' ' + tree.surname2 : '') : '');
	tree.searchName = accentFold(tree.nameAndSurname.toLowerCase());
	tree.idx = allNodes.length;
	allNodes.push(tree);
}

d3.json(jsonPath, function (error, treeData) {
	//console.log(treeData);
	publicTree = treeData;
	parseTree(publicTree, null, 1);
	running--;
});


function checkIfDone() {
	if (running > 0)
		setTimeout(checkIfDone, 100);
	else
		drawTree(publicTree);
}
checkIfDone();

// https://stackoverflow.com/questions/5700636/using-javascript-to-perform-text-matches-with-without-accented-characters
function accentFold(inStr) {
	return inStr.replace(
		/([àáâãäå])|([ç])|([èéêë])|([ìíîï])|([ñ])|([òóôõöø])|([ß])|([ùúûü])|([ÿ])|([æ])/g,
		function (str, a, c, e, i, n, o, s, u, y, ae) {
			if (a) return 'a';
			if (c) return 'c';
			if (e) return 'e';
			if (i) return 'i';
			if (n) return 'n';
			if (o) return 'o';
			if (s) return 's';
			if (u) return 'u';
			if (y) return 'y';
			if (ae) return 'ae';
		}
	);
}

function drawTree(treeData) {

	if (document.readyState == 'loading') {
		document.addEventListener('DOMContentLoaded', initSearch);
	} else {
		initSearch();
	}

	function initSearch() {
		var searchBox = document.getElementById('search');
		var searchTotal = document.getElementById('searchTotal');
		var searchResult;
		var currentPosition = 0;
		var q = document.getElementById('q');
		q.addEventListener('input', function () {
			clearSearchResults();
			searchResult = [];
			currentPosition = -1;
			document.getElementById('searchPosition').textContent = currentPosition + 1;
			var search = accentFold(q.value.toLowerCase());
			if (search == '') {
				searchBox.classList.add('nosearch');
				searchTotal.textContent = 0;
				return;
			}

			searchResult = allNodes.filter(function (node) {
				return node.searchName.includes(search);
			});
			//console.log(result);
			searchTotal.textContent = searchResult.length;
			if (searchResult.length > 0) {
				searchBox.classList.remove('nosearch');
			} else {
				searchBox.classList.add('nosearch');
			}
			if (searchResult.length == 1) {
				currentPosition = 0;
				focusNode(searchResult[currentPosition]);
				document.getElementById('searchPosition').textContent = currentPosition + 1;
			}
			highlightSearchResults(searchResult);
		});
		q.addEventListener('keydown', function (ev) {
			if (ev.key == 'Enter') {
				searchDown.click();
			}
		});
		var searchUp = document.getElementById('searchUp');
		searchUp.addEventListener('click', function (ev) {
			if (!searchResult || searchResult.length == 0)
				return;
			currentPosition -= 1;
			if (currentPosition < 0) {
				currentPosition = searchResult.length - 1;
			}
			focusNode(searchResult[currentPosition]);
			document.getElementById('searchPosition').textContent = currentPosition + 1;
		});
		var searchDown = document.getElementById('searchDown');
		searchDown.addEventListener('click', function (ev) {
			if (!searchResult || searchResult.length == 0)
				return;
			currentPosition += 1;
			if (currentPosition >= searchResult.length) {
				currentPosition = 0;
			}
			focusNode(searchResult[currentPosition]);
			document.getElementById('searchPosition').textContent = currentPosition + 1;
		});
	}

	function focusNode(d) {
		displayNode(d);
		zoomListener.scale(1);
		centerNode(d);
		highlightSearchResults([d]);
	}

	function clearSearchResults() {
		Array.from(document.querySelectorAll('.searchResult')).forEach(function (node) {
			node.classList.remove('searchResult');
		});
	}

	function highlightSearchResults(result) {
		result.forEach(function (d) {
			var node = document.getElementById('nodeGroup' + d.id);
			if (node)
				node.classList.add('searchResult');
		});
	}

	function displayNode(d) {
		if (d._children) {
			d = toggleChildren(d);
			update(d);
		}

		if (d.parentNode)
			displayNode(d.parentNode);
	}

	var maxLabelLength = 0;
	// panning variables
	var panSpeed = 200;

	// Misc. variables
	var i = 0;
	var duration = 750;
	var root;
	var maxDepth = 0;

	// size of the diagram
	var viewerWidth = $(document).width();
	var viewerHeight = $(document).height();

	var tree = d3.layout.tree().size([viewerHeight, viewerWidth]);

	// define a d3 diagonal projection for use by the node paths later on.
	var diagonal = d3.svg.diagonal().projection(function (d) {
		return [d.y, d.x];
	});

	// A recursive helper function for performing some setup by walking through all nodes
	function visit(parent, visitFn, childrenFn) {
		if (!parent) return;
		visitFn(parent);
		var children = childrenFn(parent);
		if (children) {
			var count = children.length;
			for (var i = 0; i < count; i++)
				visit(children[i], visitFn, childrenFn);
		}
	}

	// Call visit function to establish maxLabelLength
	visit(treeData, function (d) {
		maxLabelLength = Math.max(d.name.length, maxLabelLength);
	}, function (d) {
		return d.children && d.children.length > 0 ? d.children : (d._children ? d._children : null);
	});

	// TODO: Pan function, can be better implemented.
	function pan(domNode, direction) {
		var speed = panSpeed;
		if (panTimer) {
			clearTimeout(panTimer);
			translateCoords = d3.transform(svgGroup.attr("transform"));
			if (direction == 'left' || direction == 'right') {
				translateX = direction == 'left' ? translateCoords.translate[0] + speed : translateCoords.translate[0] - speed;
				translateY = translateCoords.translate[1];
			} else if (direction == 'up' || direction == 'down') {
				translateX = translateCoords.translate[0];
				translateY = direction == 'up' ? translateCoords.translate[1] + speed : translateCoords.translate[1] - speed;
			}
			scaleX = translateCoords.scale[0];
			scaleY = translateCoords.scale[1];
			scale = zoomListener.scale();
			svgGroup.transition().attr("transform", "translate(" + translateX + "," + translateY + ")scale(" + scale + ")");
			d3.select(domNode).select('g.node').attr("transform", "translate(" + translateX + "," + translateY + ")");
			zoomListener.scale(zoomListener.scale());
			zoomListener.translate([translateX, translateY]);
			panTimer = setTimeout(function () {
				pan(domNode, speed, direction);
			}, 50);
		}
	}

	// Define the zoom function for the zoomable tree
	function zoom() {
		svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
	}

	// define the zoomListener which calls the zoom function on the "zoom" event constrained within the scaleExtents
	var zoomListener = d3.behavior.zoom().scaleExtent([0.1, 3]).on("zoom", zoom);

	// define the baseSvg, attaching a class for styling and the zoomListener
	var baseSvg = d3.select("#tree-container").append("svg")
		.attr("width", viewerWidth)
		.attr("height", viewerHeight)
		.attr("class", "overlay")
		.call(zoomListener);

	function clickChildren(d) {
		if (d3.event.defaultPrevented) return; // click suppressed
		d3.event.preventDefault(); // avoid click on the person

		if (d.marriages) {
			centerNode(d);
			return;
		}
		d = toggleChildren(d);
		update(d);
	}

	function centerNode(source) {
		scale = zoomListener.scale();
		x = -source.y0;
		y = -source.x0;
		x = x * scale + viewerWidth / 2;
		y = y * scale + viewerHeight / 2;
		d3.select('g').transition()
			.duration(duration)
			.attr("transform", "translate(" + x + "," + y + ")scale(" + scale + ")");
		//zoomListener.scale(scale);
		zoomListener.translate([x, y]);
	}

	// Toggle children function
	function toggleChildren(d) {
		if (d.children) {
			d._children = d.children;
			d.children = null;
		} else if (d._children) {
			d.children = d._children;
			d._children = null;
		}
		return d;
	}

	// Toggle children on click.
	function clickPerson(d) {
		//console.log(d3.event);

		if (d3.event.defaultPrevented) return; // click suppressed
		//d = toggleChildren(d);
		//update(d);
		centerNode(d);
		displayPersonInfo(d);
	}

	function displayPersonInfo(d) {
		var html = '';
		var marriagesData = '';
		if (d.father || d.mother) {
			html += '<div class="PersonParents">Padres:' +
				formatPersonDescription(d.father) +
				formatPersonDescription(d.mother) +
				'</div>\n';
		}
		if (d.marriedTo || d.marriages) {
			let text = (d.isMale ? 'Casado' : 'Casada') + ' con:';
			if (d.marriedTo) {
				text += formatPersonDescription(d.marriedTo);
				if (d.marriedTo.married) {
					marriagesData = formatLocation(d.marriedTo.married, 'Se casó');
				}
			} else {
				text += d.marriages.map(formatPersonDescription).join(' ');
			}
			html += '<div class="PersonMarriages">' + text + '</div>';
		}
		var children = getChildren(d);
		if (children && children.length > 0) {
			html += formatChildren(children);
		}

		if (!d.marriedTo && d.parentNode) {
			var siblings = getChildren(d.parentNode);
			var allSiblings = getChildren(d.parentNode.parentNode);
			var halfSiblings = allSiblings.filter(function (x) { return !siblings.includes(x); });
			siblings = siblings.filter(function (x) { return x != d; });
			if (siblings.length > 0) {
				html += '<div class="PersonSiblings">' +
					(siblings.length == 1 ?
					(siblings[0].isMale ? 'Hermano:' : 'Hermana:') :
					(siblings.every(function (x) { return !x.isMale; }) ? 'Hermanas:' : 'Hermanos:')) +
					siblings.map(formatPersonName).join(' ') +
				'</div>\n';
			}
			if (halfSiblings.length > 0) {
				html += '<div class="PersonSiblings">' +
					(halfSiblings.length == 1 ?
					(halfSiblings[0].isMale ? 'Hermanastro:' : 'Hermanstra:') :
					(halfSiblings.every(function (x) { return !x.isMale; }) ? 'Hermanstras:' : 'Hermanstros:')) +
					halfSiblings.map(formatPersonName).join(' ') +
				'</div>\n';
			}
		}
		html += '<div class="PersonInfo">' +
			'<div class="PersonFullName">' + d.nameAndSurname + '</div>' +
			(d.birth != null ? formatLocation(d.birth, 'Nació') : '') +
			(d.married != null ? formatLocation(d.married, 'Se casó') : '') +
			marriagesData +
			(d.hometown != null ? '<span class="location">Residente en ' + d.hometown + '</span>' : '') +
			(d.death != null ? formatLocation(d.death, 'Falleció') : '') +
			(d.info ? '<div class="BioInfo">' + d.info + '</div>' : '') +
			'</div>\n';
		Swal.fire({
			title: d.fullName || d.name,
			html: html,
			confirmButtonText: 'Cerrar',
			onBeforeOpen: function () {
				const content = Swal.getContent();
				content.addEventListener('click', function (e) {
					var target = e.target;
					if (target.nodeName != 'A' || !target.classList.contains('PersonName'))
						return;
					const idx = target.getAttribute('data-idx');
					Swal.close();
					var targetD = allNodes[idx];

					displayNode(targetD);
					setTimeout(function () {
						displayPersonInfo(targetD);
					}, 0);

				});
				/*
				const $ = content.querySelector.bind(content);

				const stop = $('#stop')
				const resume = $('#resume')
				const toggle = $('#toggle')
				const increase = $('#increase')
				*/
				//Swal.showLoading();
			}
		});

	}

	// Gets the children of a person, either direct subnodes or based on marriages
	function getChildren(d) {
		if ((d.children || d._children) && !d.marriages) {
			return d.children || d._children;
		}
		// all the children of their marriages
		if (d.marriages) {
			return d.marriages.reduce(function (prev, curr) {
				var ch = curr.children || curr._children;
				if (!ch)
					return prev;
				return prev.concat(ch);
			}, []);
		}
		return [];
	}

	function formatLocation(obj, title) {
		return '<span class="location">' + title +
			(obj.place ? ' en ' + obj.place : '') +
			(obj.date ? ' el ' + (new Date(obj.date)).toLocaleDateString() : '') +
			'</span>';
	}

	function formatChildren(children) {
		var title = children.length == 1 ?
			(children[0].isMale ? 'Hijo:' : 'Hija:') :
			(children.every(function (x) { return !x.isMale; }) ? 'Hijas:' : 'Hijos:');

		return '<div class="PersonChildren">' +
			title +
			children.map(formatPersonName).join(' ') +
			'</div>';
	}

	function formatPersonName(d) {
		if (!d)
			return '';

		return '<div class="PersonDescription"><a class="PersonName" data-idx="' + d.idx + '" tabIndex="0">' + d.name + '</a>' +
			'</div>';
	}

	function formatPersonDescription(d) {
		if (!d)
			return '';

		return '<div class="PersonDescription"><a class="PersonName" data-idx="' + d.idx + '" tabIndex="0">' + d.name + (d.surname1 ? ' ' + d.surname1 : '') + '</a>' +
			'</div>';
	}

	function update(source) {
		// Compute the new height, function counts total children of root node and sets tree height accordingly.
		// This prevents the layout looking squashed when new nodes are made visible or looking sparse when nodes are removed
		// This makes the layout more consistent.
		var levelWidth = [1];
		var childCount = function (level, n) {

			if (n.children && n.children.length > 0) {
				if (levelWidth.length <= level + 1) levelWidth.push(0);

				levelWidth[level + 1] += n.children.length;
				n.children.forEach(function (d) {
					childCount(level + 1, d);
				});
			}
		};
		childCount(0, root);
		var newHeight = d3.max(levelWidth) * 70; // 70 pixels per line  
		tree = tree.size([newHeight, viewerWidth]);

		// Compute the new tree layout.
		var nodes = tree.nodes(root).reverse(),
			links = tree.links(nodes);

		// Set widths between levels based on maxLabelLength.
		nodes.forEach(function (d) {
			if (d.depth > maxDepth)
				maxDepth = d.depth;
			d.y = d.depth * (maxLabelLength * 8);
		});

		// Update the nodes…
		node = svgGroup.selectAll("g.node")
			.data(nodes, function (d) {
				return d.id || (d.id = ++i);
			});

		// Enter any new nodes at the parent's previous position.
		var nodeEnter = node.enter().append("g")
			.attr("class", "node")
			.attr('id', function (d) {
				return 'nodeGroup' + d.id;
			})
			.attr("transform", function (d) {
				return "translate(" + (parseFloat(source.y0) + (d.isMarriage ? -50 : 0)) + "," + source.x0 + ")";
			})
			.on('click', clickPerson);

		nodeEnter.append("circle")
			.attr("r", 10)
			.attr('class', function (d) {
				return d.marriages ? 'marriageCircle' : 'childrenCircle';
			})
			.on("click", clickChildren);

		nodeEnter.append("text")
			.attr("dy", ".35em")
			.attr('class', 'nodeText')
			.attr("text-anchor", function (d) {
				return "end";
			})
			.text(function (d) {
				return d.name;
			})
			.style("fill-opacity", 0);

		node.attr("title", function (d) {
			return "<strong>" + d.nameAndSurname + "</strong>";
		});
		// Update the text to reflect whether node has children or not.
		node.select('text')
			.attr("x", function (d) {
				return -5;
			})
			.attr("text-anchor", function (d) {
				//return d.children || d._children ? "end" : "start";
				return "end";
			})
			.text(function (d) {
				return d.name;
			})
			;

		// Change the circle fill depending on whether it has children and is collapsed
		node.select("circle.childrenCircle")
			.attr("class", function (d) {
				if (d.children)
					return "childrenCircle children__visible";

				if (d._children)
					return "childrenCircle children__collapsed";

				return "childrenCircle noChildren";
			});

		// Transition nodes to their new position.
		var nodeUpdate = node.transition()
			.duration(duration)
			.attr("transform", function (d) {
				return "translate(" + d.y + "," + d.x + ")";
			});

		// Fade the text in
		nodeUpdate.select("text").style("fill-opacity", 1);

		// Transition exiting nodes to the parent's new position.
		var nodeExit = node.exit().transition()
			.duration(duration)
			.attr("transform", function (d) {
				return "translate(" + source.y + "," + source.x + ")";
			}).remove();

		nodeExit.select("circle").attr("r", 0);

		nodeExit.select("text").style("fill-opacity", 0);

		// Update the links…
		var link = svgGroup.selectAll("path.link").data(links, function (d) { return d.target.id; });

		// Enter any new links at the parent's previous position.
		link.enter().insert("path", "g")
			.attr("class", function (d) {
				return d.target.isMarriage ? "link marriageLink" : "link";
			})
			.style('stroke-width', function (d) { return '20px'; })
			.attr("d", function (d) {
				var o = {
					x: source.x0,
					y: source.y0
				};
				return diagonal({
					source: o,
					target: o
				});
			});

		// Transition links to their new position.
		link.transition().duration(duration).attr("d", diagonal);

		// Transition exiting nodes to the parent's new position.
		link.exit().transition()
			.duration(duration)
			.attr("d", function (d) {
				var o = {
					x: source.x,
					y: source.y
				};
				return diagonal({
					source: o,
					target: o
				});
			})
			.remove();

		// Stash the old positions for transition.
		nodes.forEach(function (d) {
			d.x0 = d.x;
			d.y0 = d.y;
		});
	}

	// Append a group which holds all nodes and which the zoom Listener can act upon.
	var svgGroup = baseSvg.append("g");

	// Define the root
	root = treeData;
	root.x0 = viewerHeight / 2;
	root.y0 = 0;

	// Layout the tree initially and center on the root node.
	update(root);
	centerNode(root);

	// Show biography and picture on hover
	$("body").hoverIntent({
		over: function () {
			var bio = this.getAttribute("title");
			$("#bio").html("<div id='bioContents'>" + "<div class='bioInfo'>" + bio + "</div></div>")
				.fadeIn("fast");
		},
		out: function () {
			$("#bio").fadeOut("fast");
		},
		selector: ".node"
	});

}
