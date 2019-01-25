require('../../builds/devel/pskruntime');
require('../../builds/devel/psknode');

//require("callflow");
require("pskdb").startDB('./config');
$$.loadLibrary("assets", require("./libraries/assets/index"));

const pskConsole = require('swarmutils').createPskConsole();
$$.loadLibrary("cmds",require('./libraries/cmds/index'));
$$.loadLibrary("pskwallet",require("./libraries/swarms/index"));
pskConsole.runCommand();
