// Sealed build: run test/3rd-cases (node-o3-xml's own DOM test file executed
// against xmldom through test/3rd-cases/mock.js) with one result line per test.
// Usage: node t/run-o3xml.js   (node_modules/node-o3-xml must hold the
// eschnou/node-o3-xml checkout; t/vows clones it)
//
// test/3rd-cases/o3xml.js does the same setup and then requires
// node-o3-xml/test/test.js, whose loop stops at the first failing test and
// always exits 0. Here the same test object is loaded (that file's trailing
// loop replaced by an export) and every test is run, counted and reported, and
// the process exits non-zero on any failure that is not listed in EXCLUDED.
var fs = require('fs');
var path = require('path');
var Module = require('module');
var DOMParser = require('xmldom').DOMParser;

// --- same setup as test/3rd-cases/o3xml.js ---
var doc = new DOMParser().parseFromString('<xml/>', 'text/xml');
var np = doc.__proto__.__proto__.__proto__;
for (var n in np) {
	if (/_NODE$/.test(n)) {
		np[n.replace(/_NODE$/, '')] = np[n];
	}
}
var mockPath = path.resolve(__dirname, '../test/3rd-cases/mock.js');
require(mockPath);
require.cache[require.resolve('node-o3-xml')] = require.cache[mockPath];
require('node-o3-xml').parseFromString = function (xml) {
	return new DOMParser().parseFromString(xml, 'text/xml');
};

// --- load node-o3-xml/test/test.js with its run loop replaced by an export ---
var testFile = require.resolve('node-o3-xml/test/test');
var src = fs.readFileSync(testFile, 'utf8');
var loopAt = src.lastIndexOf('for (var i in test)');
if (loopAt < 0) {
	throw new Error('run loop not found in ' + testFile);
}
src = src.slice(0, loopAt) + '\nmodule.exports = test;\n';
var m = new Module(testFile, module);
m.filename = testFile;
m.paths = Module._nodeModulePaths(path.dirname(testFile));
m._compile(src, testFile);
var tests = m.exports;

// Tests that exercise o3/libxml2 behaviour xmldom 0.1.31 does not implement.
var WRONG_DOC = 'expects WRONG_DOCUMENT_ERR when a node created by another document ' +
	'is inserted; xmldom 0.1.31 performs no ownerDocument check';
var HIERARCHY = 'expects HIERARCHY_REQUEST_ERR when an ancestor is inserted into its ' +
	'own descendant; xmldom 0.1.31 performs no hierarchy check';
var XPATH = 'calls Element.selectNodes (XPath), an o3/libxml2 extension xmldom does not provide';
var EXCLUDED = {
	test9: WRONG_DOC,
	test10: HIERARCHY,
	test11: HIERARCHY,
	test29: 'expects setAttributeNode to move an attribute owned by another element ' +
		'(libxml2 semantics); xmldom 0.1.31 throws INUSE_ATTRIBUTE_ERR as W3C DOM Level 2 specifies',
	test30: WRONG_DOC,
	test32: XPATH,
	test33: XPATH,
	test34: XPATH,
	test35: XPATH,
	test36: XPATH
};

var passed = 0, failed = [], skipped = 0;
Object.keys(tests).forEach(function (name) {
	if (EXCLUDED[name]) {
		console.log('SKIPPED (excluded) o3xml ' + name + ' -- ' + EXCLUDED[name]);
		skipped++;
		return;
	}
	var ok, err;
	try {
		ok = tests[name]();
	} catch (e) {
		ok = false;
		err = e;
	}
	if (ok) {
		passed++;
		console.log('ok   o3xml ' + name);
	} else {
		failed.push(name);
		console.log('FAIL o3xml ' + name + (err ? ' threw ' + (err.stack || err) : ' returned false'));
	}
});
console.log('o3xml summary: ' + Object.keys(tests).length + ' tests, ' + passed +
	' passed, ' + failed.length + ' failed, ' + skipped + ' skipped (excluded)');
process.exit(failed.length ? 1 : 0);
