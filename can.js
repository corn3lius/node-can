/* Copyright Sebastian Haas <sebastian@sebastianhaas.info>. All rights reserved.
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

//-----------------------------------------------------------------------------
// CAN-Object
var can;
try {
	can = require('./build/Release/can');
} catch (err) {
	console.log(" ERROR : " + err);
	console.log('CAN is not built for this system -- Enter DEMO mode.');
	// describe the interactivity
	can = {
		'RawChannel' : function(channel, timestamp) {
			console.log(">> Start fake Channel " + channel + " @ " + timestamp);
		}
	};
}

var buffer = require('buffer');

/**
 * @method createRawChannel
 * @param channel
 *            {string} Channel name (e.g. vcan0)
 * @return {RawChannel} a new channel object or exception
 * @for exports
 */
exports.createRawChannel = function(channel, timestamps) {
	return new can.RawChannel(channel, timestamps);
}

// -----------------------------------------------------------------------------
/**
 * The Signals modules provides an interface to access the values/signals
 * encoded in CAN messages.
 * 
 * @module Signals
 */

var _signals;

try {
	_signals = require('./build/Release/can_signals');
} catch (err) {
	console.log(" ERROR : " + err);
	console.log('Can_Signals is not built for this system -- Enter DEMO mode.');
	_signals = {
		// _signals.encode_signal(canmsg.data, s.bitOffset, s.bitLength,
		// s.endianess == 'little', s.type == 'signed', val);
		'encode_signal' : function() {
		},
		// _signals.decode_signal(msg.data, s.bitOffset, s.bitLength,
		// s.endianess == 'little', s.type == 'signed');
		'decode_signal' : function() {
		}
	};

}

var kcd = require('./parse_kcd');

/**
 * The actual signal.
 * 
 * @class Signal
 */
function Signal(desc) {
	/**
	 * Symbolic name
	 * 
	 * @attribute name
	 * @final
	 */
	this.name = desc['name'];
	this.spn = desc['spn'];

	this.bitOffset = desc['bitOffset'];
	this.bitLength = desc['bitLength'];
	this.endianess = desc['endianess'];
	this.type = desc['type'];

	this.offset = desc['offset'];
	this.scale = desc['scale'];

	this.minValue = desc['minValue'];
	this.maxValue = desc['maxValue'];

	this.units = desc['units'];
	// console.log(" units - " + this.unit );

	/**
	 * Label set for defined states of the signal.
	 */
	this.labels = desc['labels'];

	/**
	 * this will allow triggering on mux'ed message ids.
	 */
	this.muxGroup = [ desc['mux'] ];

	/**
	 * Current value
	 * 
	 * @attribute value
	 * @final
	 */
	this.value = desc['defaultValue'];

	if (!this.value)
		this.value = 0;

	this.listeners = [];
	
	this.alwaysReport = desc['alwaysReport'];
	if (!this.alwaysReport) {
		this.alwaysReport = false;
	}
};

/**
 * Keep track of listeners who want to be notified if this signal changes
 * 
 * @method onChange
 * @param listener
 *            JS callback to get notification
 * @for Signal
 */
Signal.prototype.onChange = function(listener) {
	this.listeners.push(listener);
	// console.log(" Listener -- " + JSON.stringify(this.listeners));
};

/**
 * Set new value of this signal. Any local registered clients will receive a
 * notification. Please note, no CAN message is actually send to the bus (@see
 * DatabaseServer::send)
 * 
 * @method update
 * @param newValue
 *            {bool|double|integer} New value to set
 * @for Signal
 */
Signal.prototype.update = function(newValue) {
	// Nothing changed
	if (this.value == newValue) {
		if (this.alwaysReport==false) {
			return;
		}
		else {
			console.log("ALWAYSREPORT ITEM: " + this.name +" value=" + newValue);
		}
	} 

	if (newValue > this.maxValue) {
		console.error("ERROR : " + this.name + " value= " + newValue	+ " above maxValue:" + this.maxValue);
	} else if (newValue < this.minValue) {
		console.error("ERROR : " + this.name + " value= " + newValue  + " below minValue:" + this.minValue);
	}

	this.value = newValue;

	// Update all listeners, that the signal changed
	for (var f = 0; f < this.listeners.length; f++) {
		this.listeners[f](this);
	}
};

// -----------------------------------------------------------------------------
/**
 * Just a container to keep the Signals.
 * 
 * @class Message
 */
function Message(desc) {
	/**
	 * CAN identifier
	 * 
	 * @attribute id
	 * @final
	 */
	this.id = desc.id;

	/**
	 * Extended Frame Format used
	 * 
	 * @attribute ext
	 * @final
	 */
	this.ext = desc.ext;

	/**
	 * Symbolic name
	 * 
	 * @attribute name
	 * @final
	 */
	this.name = desc.name;

	/**
	 * Length in bytes of resulting CAN message
	 * 
	 * @attribute len
	 * @final
	 */
	this.len = desc.len;

	/**
	 * This is the time frame that the message gets generated
	 * 
	 * @attribute interval
	 * @final
	 */
	this.interval = desc.interval;

	/**
	 * This is tells us the message is mutliplexed.
	 * 
	 * @attribute muxed
	 * @final
	 */
	this.muxed = desc.muxed;

	/**
	 * Named array of signals within this message. Accessible via index and
	 * name.
	 * 
	 * @attribute {Signal} signals
	 * @final
	 */
	this.signals = [];

	for (i in desc['signals']) {

		var s = desc['signals'][i];
		// console.log("sig -- " + s.name );
		if (this.signals[s.name] && this.signals[s.name].muxGroup) {
			// console.log("found a duplicate msg " + s.name + ": " + s.mux + "
			// ... probably LoadNumber" );
			this.signals[s.name].muxGroup.push(s.mux);
		} else {
			// console.log("Add signal " + JSON.stringify(s) );
			this.signals[s.name] = new Signal(s);
		}

	}

}

// -----------------------------------------------------------------------------
/**
 * A DatabaseService is usually generated once per bus to collect signals coded
 * in the CAN messages according a DB description.
 * 
 * @class DatabaseService
 * @constructor DatabaseService
 * @param channel
 *            RAW channel
 * @param db_desc
 *            Set of rules to decode/encode signals (@parse_kcd.js)
 * @return a new DatabaseService
 * @for DatabaseService
 */
function DatabaseService(channel, db_desc) {

	this.channel = channel;

	/**
	 * Named array of known messages. Accessible via index and name.
	 * 
	 * @attribute {Message} messages
	 */
	this.messages = [];

	for (i in db_desc) {
		var m = db_desc[i];
		// console.log(" >>>> db load msg --- "+ JSON.stringify(m) );
		var id = m.id | (m.ext ? 1 : 0) << 31;

		var nm = new Message(m);
		// this.messages[id] = nm;
		this.messages[m.name] = nm;
	}

	channel.addListener("onMessage", this.onMessage, this);

}

DatabaseService.prototype.getMessageById = function(msg_id) {
	for (m in this.messages) {
		// console.log( this.messages[m].id + " == " + msg_id );
		if (this.messages[m].id && this.messages[m].id == msg_id) {
			// console.log("Returning - " + JSON.stringify(this.messages[m]))
			return this.messages[m];
		}
	}
	return undefined;
};

var showItemValues = { 
	 WeightOnTruckReset : 1
 };

// Callback for incoming messages
DatabaseService.prototype.onMessage = function(msg) {
	//console.log("DatabaseService.prototype.onMessage MSG " + JSON.stringify(msg) );
	if (msg == undefined)
		return;
	if (msg.rtr)
		return;

	var id = msg.id | (msg.ext ? 1 : 0) << 31;

	var m = this.getMessageById(msg.id);
	if (!m) {
		return;
	}
	// this is the possible multiplexor for the signals coming in.
	var b1mux = _signals.decode_signal(msg.data, 0, 8, true, false);

	var found = false;
	// Let the C-Portition extract and convert the signal
	for (i in m.signals) {

		var s = m.signals[i];
		if (s.value === undefined)
			continue;
		// if this is a mux signal and the muxor isnt in my list...
		if (m.muxed && s.muxGroup && s.muxGroup.indexOf(b1mux) == -1) {
//			console.log("       muxNotInMyGroup");
			continue;
		}

		found=true;
		var mask = 0;
		for (var j = 0; j < s.bitLength; j++) {
			mask |= (1 << j);
		}

		var val = _signals.decode_signal(msg.data, s.bitOffset, s.bitLength, s.endianess == 'little', s.type == 'signed');

		val &= mask;

		if (s.scale)
			val *= s.scale;

		if (s.offset)
			val += s.offset;

		if (showItemValues[s.name]) {
			console.log("    ONMSG --- ");
			console.log("    ONMSG --- ");
			console.log("    ONMSG --- " + JSON.stringify(s));
			console.log("    ONMSG --- ");
			console.log("    ONMSG --- ");
		}
		s.update(val);
	}
	if (found==false) {
		console.log("      ERROR: b1mux:" + JSON.stringify(b1mux) );
	
	}
};

/**
 * Construct a CAN message and encode all related signals according the rules.
 * Finally send the message to the bus.
 * 
 * @method send
 * @param msg_name
 *            Name of the message to generate
 * @for DatabaseService
 */
DatabaseService.prototype.send = function(msg_name) {
	var args = msg_name.split("."); // allow for mux'ed messages sent.

	var m = this.messages[args[0]];
	var mux = (args.length > 1) ? args[1] : undefined;

	if (!m)
		throw msg_name + " not defined";

	var canmsg = {
		id : m.id,
		ext : m.ext,
		rtr : false,
		data : (m.len > 0 && m.len < 8) ? new Buffer(m.len) : new Buffer(8)
	};

	canmsg.data.fill(0);

	if (mux) {
		_signals.encode_signal(canmsg.data, 0, 8, true, false,
				parseInt(mux, 16));
	}
	for (i in m.signals) {
		var s = m.signals[i];
		if (s.value == undefined)
			continue;

		if (mux) {
			// console.log("SEND muxed - " + mux + " is it in this list " +
			// s.muxGroup + " = " + s.muxGroup.indexOf(parseInt(mux,16)) )
			if (s.muxGroup.indexOf(parseInt(mux, 16)) === -1) {
				continue;
			}
		}

		var val = s.value;

		// console.log("ENCODE " + s.name + " : " + val + " @ " + s.bitOffset +
		// "." + s.bitLength );
		// console.log(" data -- " + canmsg.data.toJSON() );

		// Apply factor/offset and convert to Integer
		if (s.offset)
			val -= s.offset;

		if (s.scale)
			val /= s.scale;

		if (typeof (val) == 'double')
			val = parseInt(Math.round(val));

		if (m.len == 0) {
			// console.log("0 length packet - " + m.id);
			return;
		}

		_signals.encode_signal(canmsg.data, s.bitOffset, s.bitLength,
				s.endianess == 'little', s.type == 'signed', val);
		// console.log("buff " + canmsg.data.toJSON());
	}
	// console.log("SEND --- " + canmsg.id.toString(16) + " : " +
	// canmsg.data.toJSON() );
	this.channel.send(canmsg);

}

/**
 * @method parseNetworkDescription
 * @param file
 *            {string} Path to KCD file to parse
 * @return DB description to be used in DatabaseService
 * @for exports
 */
exports.parseNetworkDescription = kcd.parseKcdFile;
exports.DatabaseService = DatabaseService;
