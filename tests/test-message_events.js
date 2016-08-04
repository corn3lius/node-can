var can = require('socketcan');
var buffer = require('buffer')

exports['message_event_timing'] = function(test) {

	// Parse database
	var network = can.parseNetworkDescription("./tests/samples.kcd");
	var channel = can.createRawChannel("vcan0");
	var gen_channel = can.createRawChannel("vcan0");
    channel.addListener("onMessage", function(msg){
        var sigs = db.messages["TestMessage"].signals;
        for( var s in sigs){
            console.log("PRE ON MSG sig : ", sigs[s].name, " = ", sigs[s].value );  
        }
    });
	var db      = new can.DatabaseService(channel, network.buses["Motor"]);

    channel.start();
    gen_channel.start(); 
    
    channel.addListener("onMessage", function(msg){
        var sigs = db.messages["TestMessage"].signals;
        for( var s in sigs){
            console.log("POST ON MSG sig : ", sigs[s].name, " = ", sigs[s].value );  
        }
    });

    var cm = { data: new Buffer(8) };
	cm.id = db.messages["TestMessage"].id;

    var i = 1;
    var intv = setInterval(function(){
        cm.data[0] = 99 + i;
        cm.data[1] = 99 + i; 
        cm.data[2] = 99 + i;  
        cm.data[3] = 99 + i;
        cm.data[4] = 99 + i;
        cm.data[5] = 99 + i; 
        cm.data[6] = 99 + i;  
        cm.data[7] = 99 + i;
        console.log("-------- sending ", cm);
        gen_channel.send(cm);  
        if( i++ > 10){
            clearInterval(intv);
            test.done();
            delete db;
        } 
    }, 1000);  

    var sigs = db.messages["TestMessage"].signals;
    
    for( var s in sigs ){
        sigs[s].onChange(function(signal){
            console.log(signal.name , " -- ", signal.value);
        });      
    } 



}