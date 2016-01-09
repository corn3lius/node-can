var signals = require('../build/Release/can_signals');
var buffer = require('buffer')

exports['little_endian_encode'] = function(test) {
	data = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);
  testBuf = new Buffer(8);
	testBuf.writeUIntLE(0xEDB, 0, 6);

	console.log(testBuf);
	// a byte is a byte endianness only deals with the ordering of the bytes
	// LI - 1, 2, 3, 4, 5, 6, 7, 8  and
	// BI - 8, 7, 6, 5, 4, 3, 2, 1
	// but the byte is always in most significant bits
	//   ie 2^n
	// -- [ 7 6 5 4 ] [ 3 2 1 0 ]
	//   so 2^0 == 1
	// 0b [ 0 0 0 0 ] [ 0 0 0 1 ]
	//      2^1 == 2
	// 0b [ 0 0 0 0 ] [ 0 0 1 0 ]
	//
	// Shifting 1 into the first byte shouldn't set the most significant byte of
	// and subsequent additions should follow the bytes significance internally
	//
	signals.encode_signal(data, 0, 1, true, false, 1);
	// should result in
	// 0x [    0    ] [    1    ]
	// 0x [ 0 0 0 0 ] [ 0 0 0 1 ]
	signals.encode_signal(data, 1, 1, true, false, 1);
	// should result in
	// 0x [    0    ] [    3    ]
	// 0x [ 0 0 0 0 ] [ 0 0 1 1 ]
	signals.encode_signal(data, 2, 1, true, false, 0 /* set zero */);
	// should result in
	// 0x [    0    ] [    3    ]
	// 0x [ 0 0 0 0 ] [ 0 0 1 1 ]
	signals.encode_signal(data, 3, 1, true, false, 1);
	// should result in
	// 0x [    0    ] [    B    ]
	// 0x [ 0 0 0 0 ] [ 1 0 1 1 ]
	test.deepEqual(data, new Buffer([0x0B, 0x00, 0x00, 0, 0, 0, 0, 0]));

  // ok...  But what about byte boundaries
	//  a little more tricky but shouldn't be too hard.
	// remember from above the place intrabyte before shifting byte bounds
	//
	// 0x [    0    ] [    B    ]
	// 0x [ 0 0 0 0 ] [ 1 0 1 1 ]
	//            4 <- this is our starting point for shifting in the next 8 bits
	// 0x [ 0 0 0 0 ] [ 1 0 1 1 ] 0x [ 0 0 0 0 ] [ 0 0 0 0 ]
	//                                                   ^
	//     This is where we will continue adding overflow bits since it is the
	//       least significant bit in this byte.
	signals.encode_signal(data, 4, 8, true, false, 0xEA);
	test.deepEqual(data, new Buffer([0xAB, 0x0E, 0x00, 0, 0, 0, 0, 0]));

	signals.encode_signal(data, 12, 12, true, false, 0xEDB);
	test.deepEqual(data, new Buffer([0xAB, 0xBE, 0xED, 0, 0, 0, 0, 0]));

	signals.encode_signal(data, 12, 12, true, false, 0);
	test.deepEqual(data, new Buffer([0xAB, 0x0E, 0x00, 0, 0, 0, 0, 0]), "Overwriting signal value failed");

	test.done();
}

exports['little_endian_decode'] = function(test) {
	data = new Buffer([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]);

  /*
	  get from the first bit until 8 12 and 16 bits
		0x [ 7  6  5  4  3  2  1  0 ] 0x [ 15 14 13 12 11 10 9  8 ]
    0x [     D           E      ]       <--  8 = 0xDE
		0x [     D           E      ] 0x [ .  .  .  .      D     ] <-- 12 = 0x0D DE
		0x [     D           E      ] 0x [     A           D     ] <-- 16 = 0xAD DE

	*/
	test.equals(signals.decode_signal(data, 0, 8, true, false), 0xDE);
	test.equals(signals.decode_signal(data, 0, 12, true, false), 0xDDE);
	test.equals(signals.decode_signal(data, 0, 16, true, false), 0xADDE);
	console.log( "Set one");

  /*
	  get from the twelfth until 8 12 and 20 bits
		start at 12    V         and get more significant bits
		0x [ 15 14 13 12 11 10 9  8 ] 0x [ 23 22 21 20 19 18 17 16 ]
    0x [     A       .  .  .  . ] 0x [ .  .  .  .      E     ] <--  8 = 0xEA
		0x [     A       .  .  .  . ] 0x [     B           E     ] <-- 12 = 0x0B EA
		0x [     A       .  .  .  . ] 0x [     B           E     ]
		0x [     E            F     ]	<-- 16 = 0xE FB EA
	*/

	test.equals(signals.decode_signal(data, 12, 8, true, false), 0xEA);
	test.equals(signals.decode_signal(data, 12, 12, true, false), 0xBEA);
	test.equals(signals.decode_signal(data, 12, 20, true, false), 0xEFBEA);
	console.log( "Set two");

  // first nibble should be  E or 1110
	// remember significance. (see above)
	console.log("bits : ",
	signals.decode_signal(data,0,2,true,false).toString(16),
	signals.decode_signal(data,1,2,true,false).toString(16),
	signals.decode_signal(data,2,2,true,false).toString(16),
	signals.decode_signal(data,3,2,true,false).toString(16) );
	/*
	test.equals(signals.decode_signal(data, 0, 1, true, false), 0);
	test.equals(signals.decode_signal(data, 1, 1, true, false), 1);
	test.equals(signals.decode_signal(data, 2, 1, true, false), 1);
	test.equals(signals.decode_signal(data, 3, 1, true, false), 1);
	*/
	console.log( "Set three");

	test.done();
}

exports['little_endian_signed_decode'] = function(test) {
	data = new Buffer([0xFE, 0xFF, 0x80]);

	test.equals(signals.decode_signal(data, 8, 8, true, true), -1);
	test.equals(signals.decode_signal(data, 0, 16, true, true), -2);
	test.equals(signals.decode_signal(data, 16, 8, true, true), -128);

	test.done();
}

exports['little_endian_signed_encode'] = function(test) {
	data = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 0, 8, true, true, -1);
	test.deepEqual(data, [0xFF, 0x00, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 0, 16, true, true, -2);
	test.deepEqual(data, [0xFE, 0xFF, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 16, 8, true, true, -128);
	test.deepEqual(data, [0xFE, 0xFF, 0x80, 0, 0, 0, 0, 0]);

	test.done();
}

exports['big_endian_encode'] = function(test) {
	data = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 0, 1, false, false, 1);
	signals.encode_signal(data, 1, 1, false, false, 1);
	signals.encode_signal(data, 2, 1, false, false, 0);
	signals.encode_signal(data, 3, 1, false, false, 1);
	test.deepEqual(data, [0xD0, 0x00, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 11, 8, false, false, 0xEA);
	test.deepEqual(data, [0xDE, 0xA0, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 23, 12, false, false, 0xDBE);
	test.deepEqual(data, [0xDE, 0xAD, 0xBE, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 23, 12, false, false, 0);
	test.deepEqual(data, [0xDE, 0xA0, 0x00, 0, 0, 0, 0, 0], "Overwriting signal value failed");

	test.done();
}

exports['big_endian_decode'] = function(test) {
	data = new Buffer([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]);

	test.equals(signals.decode_signal(data, 7, 8, false, false), 0xDE);
	test.equals(signals.decode_signal(data, 15, 16, false, false), 0xDEAD);

	test.equals(signals.decode_signal(data, 0, 1, false, false), 1);
	test.equals(signals.decode_signal(data, 1, 1, false, false), 1);
	test.equals(signals.decode_signal(data, 2, 1, false, false), 0);
	test.equals(signals.decode_signal(data, 3, 1, false, false), 1);

	test.done();
}

exports['big_endian_signed_encode'] = function(test) {
	data = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 7, 8, false, true, -1);
	test.deepEqual(data, [0xFF, 0x00, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 15, 16, false, true, -2);
	test.deepEqual(data, [0xFF, 0xFE, 0x00, 0, 0, 0, 0, 0]);

	signals.encode_signal(data, 23, 8, false, true, -128);
	test.deepEqual(data, [0xFF, 0xFE, 0x80, 0, 0, 0, 0, 0]);

	test.done();
}

exports['big_endian_signed_decode'] = function(test) {
	data = new Buffer([0xFF, 0xFE, 0x80 ]);

	test.equals(signals.decode_signal(data, 7, 8, false, true), -1);
	test.equals(signals.decode_signal(data, 15, 16, false, true), -2);
	test.equals(signals.decode_signal(data, 23, 8, false, true), -128);

	test.done();
}
