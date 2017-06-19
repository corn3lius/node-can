/* Copyright Sebastian Haas <sebastian$sebastianhaas.info>. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

var fs = require('fs');
var xml2js = require('xml2js');

//-----------------------------------------------------------------------------

exports.parseKcdFile = function(file) {
	var result = {}; // Result will be a dictionary describing the whole network

	var data = fs.readFileSync(file);
	
	var parser = new xml2js.Parser({explicitArray: true});
		
	parser.parseString(data, function(e, i) {
		result.nodes = {};

		var d = i['NetworkDefinition'];

		for (n in d['Node']) {
			var node = d['Node'][n]['$'];
			
			result.nodes[node['id']] = {};
			result.nodes[node['id']].name   = node['name'];
			result.nodes[node['id']].buses  = {};
			result.nodes[node['id']].device = node['device'];	
			result.nodes[node['id']].J1939 = {
					'AAC'        : node['J1939AAC'],
					'Function'   : node['J1939Function'],
					'Vehicle'    : node['J1939Vehicle'],
					'Identity'   : node['J1939IdentityNumber'],
					'Industry'   : node['J1939IndustryGroup'],
					'System'     : node['J1939System'],
					'Manufacture': node['J1939ManufacturerCode'], 
					getName   : function(){
						var name = new Buffer(8);
						name[7] = ((this.AAC & 0x1) << 7) | ((this.Industry & 0x7) << 4) | (this.Vehicle & 0xF);
						name[6] = (this.System) << 1  & 0xFE;
						name[5] = this.Function & 0xFF; 
						name[4] = 0; // function Instance & ECU instance 
						name[3] = (this.Manufacture >> 3) & 0xFF ;
						name[2] = ((this.Manufacture & 0x7) << 5) | ( (this.Identity >> 16) & 0x1F ); 
						name[1] = (this.Identity >> 8 ) & 0xFF; 
						name[0] = this.Identity & 0xFF; 						
						
						return name;
					},				
			}
			
			// J1939AAC="0x1" 
			// J1939Function="0x42"
			// J1939IdentityNumber="0x30001" 
			// J1939IndustryGroup="0x2"
			// J1939ManufacturerCode="0x97" 
			// J1939System="0xB" id="0xA0"
			
			//console.log("Node : " + node['name'] + " . " + node['id'] )
		}
		
		result.buses = {};
		for (b in d['Bus']) {
			var bus = d['Bus'][b]['$'];
			
			result.buses[bus['name']] = {};
			var new_bus = result.buses[bus['name']];

			new_bus['messages'] = [];
			for (m in d['Bus'][b]['Message']) {
				var message = d['Bus'][b]['Message'][m]['$'];
				var producers = d['Bus'][b]['Message'][m]['Producer'];
				var consumers = d['Bus'][b]['Message'][m]['Consumer'];
				
				var multiplex = d['Bus'][b]['Message'][m]['Multiplex'];
				//console.log( "MSG : " + m + "  " + message.name  ) 
			
				var _m = {
					name: message.name,
					id: parseInt(message.id, 16),
					ext: message.format == 'extended',
					triggered: message.triggered == 'true',
					len: message.len ? parseInt(message.len) : 0,
					interval: message.interval ? parseInt(message.interval) : 0,
					muxed : (multiplex != undefined ),
				};
				
				// Add messages going out and from whom.  
				for (p in producers) {
					for (n in producers[p]['NodeRef']) {
						var id = producers[p]['NodeRef'][n]['$']['id'];
						//console.log( "p? -- " + id )
						if (result.nodes[id])
						{
							//console.log(" P + " + message.name  );
							if (result.nodes[id].produces == undefined)
								result.nodes[id].produces =  [];
							
							result.nodes[id].produces.push(_m.name);
						}
					}
				}
				// Add listeners / targets for the message. 
				for (c in consumers) {
					for (n in consumers[c]['NodeRef']) {
						var id = consumers[c]['NodeRef'][n]['$']['id'];
						
						if (result.nodes[id])
						{
							//console.log(" C + " + message.name  );
							if (result.nodes[id].consumes == undefined)
								result.nodes[id].consumes =  [];
							
							result.nodes[id].consumes.push(_m.name);
						}
					}
				}
				
				// add the message to the list. 				
				new_bus['messages'].push(_m);
	
				_m.signals = [];
				
				var maxOffset = 0;
				
				// look for multiplexed messages 
				for ( mux in multiplex ){
					for (mg in multiplex[mux]['MuxGroup'] ){
						var muxmsg = multiplex[mux]['MuxGroup'][mg]['$'];
						
						for (s in multiplex[mux]['MuxGroup'][mg]['Signal']) {
							var signal = multiplex[mux]['MuxGroup'][mg]['Signal'][s]['$'];
							var value = multiplex[mux]['MuxGroup'][mg]['Signal'][s]['Value'];
							
							var _s = {
								name: signal.name,
								mux : parseInt(muxmsg['id'],16),
								bitLength: signal.len ? parseInt(signal.len) : 1,
								endianess: signal.endianess ? signal.endianess : 'little',
								spn : signal.spn,
								alwaysReport: signal.alwaysReport ? signal.alwaysReport : false,
								labels : {},
							};							
							// add Values from the database 
							if (Array.isArray(value)) {
								_s.scale = value[0]['$'].scale ? parseFloat(value[0]['$'].scale) : 1.0;
								_s.offset = value[0]['$'].offset ? parseFloat(value[0]['$'].offset) : 0.0;
								_s.units = value[0]['$'].units ? value[0]['$'].units : "";
								_s.minValue = value[0]['$'].min ? value[0]['$'].min : undefined;
								_s.maxValue = value[0]['$'].max ? value[0]['$'].max : undefined;
								_s.type = value[0]['$'].type ? value[0]['$'].type : "unsigned";
								_s.defaultValue = value[0]['$'].defaultValue ? parseFloat(value[0]['$'].defaultValue) : 0.0 ;
							}
							// add label sets from the database. 
							if( Array.isArray( value[0].LabelSet )){
								var labels = value[0].LabelSet[0]['Label'];
								for ( var i =0 ; i <  labels.length; i++  ){
									_s.labels[labels[i]['$'].value] = labels[i]['$'].name ;
								}
							}
							
							var offset_num = parseInt(signal.offset) + _s.bitLength;

							if (offset_num > maxOffset)
								maxOffset = offset_num;

							_s.bitOffset = parseInt(signal.offset);
							
							_m.signals.push(_s);
							
						}
					}
					
				}
				
				for (s in d['Bus'][b]['Message'][m]['Signal']) {
					var signal = d['Bus'][b]['Message'][m]['Signal'][s]['$'];
					var value = d['Bus'][b]['Message'][m]['Signal'][s]['Value'];

					//console.log( "SIG : " + s + "  " + signal.name ) 
					
					var _s = {
						name: signal.name,
						bitLength: signal.len ? parseInt(signal.len) : 1,
						endianess: signal.endianess ? signal.endianess : 'little',
						spn : signal.spn,
						alwaysReport: signal.alwaysReport ? signal.alwaysReport : false,
						labels : {},
					};
					// add Values from the database 
					if (Array.isArray(value)) {
						_s.scale = value[0]['$'].scale ? parseFloat(value[0]['$'].scale) : 1.0;
						_s.offset = value[0]['$'].offset ? parseFloat(value[0]['$'].offset) : 0.0;
						_s.units = value[0]['$'].units ? value[0]['$'].units : "";
						_s.minValue = value[0]['$'].min ? value[0]['$'].min : undefined;
						_s.maxValue = value[0]['$'].max ? value[0]['$'].max : undefined;
						_s.type = value[0]['$'].type ? value[0]['$'].type : "unsigned";
						_s.defaultValue = value[0]['$'].defaultValue ? parseFloat(value[0]['$'].defaultValue) : 0.0 ;
					}
					// add label sets from the database. 
					if( Array.isArray( value[0].LabelSet )){
						var labels = value[0].LabelSet[0]['Label'];
						for ( var i =0 ; i <  labels.length; i++  ){
							_s.labels[labels[i]['$'].value] = labels[i]['$'].name ;
						}
					}
					var offset_num = parseInt(signal.offset) + _s.bitLength;

					if (offset_num > maxOffset)
						maxOffset = offset_num;

					_s.bitOffset = parseInt(signal.offset);

					_m.signals.push(_s);
				}
							   				
				if (!_m.len) {
					_m.len = parseInt(maxOffset / 8);
					if (maxOffset % 8 > 0)
						_m.len++;
					//console.log("ERROR in "+ _m.name+ " -  max offset - " + maxOffset + " m.len " + _m.len );
				}
			}
		}
	});

	// NOTE: Not sure if it is safe here to access result, but I guess parsing the XML file is more or less synchronous.
	
	return result;
}
