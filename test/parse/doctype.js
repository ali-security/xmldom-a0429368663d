var vows = require('vows');
var assert = require('assert');
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;

// CVE-2021-21366: system identifiers and FPIs (public identifiers) of a DOCTYPE
// have to be preserved as they appear in the source, including their quotes,
// so that parsing and serializing a document does not change its syntax.

function getTestParser() {
	var errors = {};
	function collect(level) {
		return function (msg) {
			(errors[level] = errors[level] || []).push(msg);
		};
	}
	var parser = new DOMParser({
		locator: {},
		errorHandler: {
			warning: collect('warning'),
			error: collect('error'),
			fatalError: collect('fatalError')
		}
	});
	return {errors: errors, parser: parser};
}

function parseDoctype(source) {
	var p = getTestParser();
	var doc = p.parser.parseFromString(source, 'text/xml');
	assert.deepEqual(p.errors, {}, 'unexpected errors: ' + JSON.stringify(p.errors));
	return doc;
}

function roundTrip(source) {
	return new XMLSerializer().serializeToString(parseDoctype(source));
}

// The identifiers of a serialized DOCTYPE have to be complete quoted literals,
// otherwise the content of an identifier ends up as markup (e.g. an internal subset).
var LITERAL = '(?:\'[^\']*\'|"[^"]*")';
var PUBLIC_DOCTYPE = new RegExp('^<!DOCTYPE x PUBLIC ' + LITERAL + '(?: ' + LITERAL + ')?>');
var SYSTEM_DOCTYPE = new RegExp('^<!DOCTYPE x SYSTEM ' + LITERAL + '>');

var INJECTED = '\'" [<!ENTITY xxe SYSTEM "file:///etc/passwd">] "\'';

vows.describe('doctype').addBatch({
	'SYSTEM id with mixed quotes (outer single)': function () {
		var actual = parseDoctype('<!DOCTYPE x SYSTEM \'"\'><X/>').firstChild;
		assert.equal(actual.name, 'x');
		assert.equal(actual.systemId, '\'"\'');
		assert.ok(!actual.publicId, 'publicId: ' + actual.publicId);
	},
	'SYSTEM id with mixed quotes (outer double)': function () {
		var actual = parseDoctype('<!DOCTYPE x SYSTEM "\'"><X/>').firstChild;
		assert.equal(actual.name, 'x');
		assert.equal(actual.systemId, '"\'"');
		assert.ok(!actual.publicId, 'publicId: ' + actual.publicId);
	},
	'PUBLIC id with mixed quotes (outer single)': function () {
		var actual = parseDoctype('<!DOCTYPE x PUBLIC \'"\'><X/>').firstChild;
		assert.equal(actual.name, 'x');
		assert.equal(actual.publicId, '\'"\'');
		assert.ok(!actual.systemId, 'systemId: ' + actual.systemId);
	},
	'PUBLIC id with mixed quotes (outer double)': function () {
		var actual = parseDoctype('<!DOCTYPE x PUBLIC "\'"><X/>').firstChild;
		assert.equal(actual.name, 'x');
		assert.equal(actual.publicId, '"\'"');
		assert.ok(!actual.systemId, 'systemId: ' + actual.systemId);
	},
	'PUBLIC id and SYSTEM id are kept with their quotes': function () {
		var actual = parseDoctype('<!DOCTYPE x PUBLIC "pub" \'sys\'><x/>').firstChild;
		assert.equal(actual.publicId, '"pub"');
		assert.equal(actual.systemId, '\'sys\'');
	},
	'serializing preserves PUBLIC and SYSTEM ids': function () {
		var source = '<!DOCTYPE x PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><x/>';
		assert.equal(roundTrip(source), source);
	},
	'serializing preserves a PUBLIC id without SYSTEM id': function () {
		var source = '<!DOCTYPE x PUBLIC "-//W3C//DTD HTML 4.01//EN"><x/>';
		assert.equal(roundTrip(source), source);
	},
	'serializing preserves a SYSTEM id': function () {
		var source = '<!DOCTYPE x SYSTEM "x.dtd"><x/>';
		assert.equal(roundTrip(source), source);
	},
	'serializing preserves mixed quotes in ids': function () {
		var source = '<!DOCTYPE x PUBLIC \'"\' "\'"><x/>';
		assert.equal(roundTrip(source), source);
		source = '<!DOCTYPE x SYSTEM \'"\'><x/>';
		assert.equal(roundTrip(source), source);
	},
	'PUBLIC id can not inject an internal subset when serialized': function () {
		var source = '<!DOCTYPE x PUBLIC ' + INJECTED + ' "sys"><x/>';
		var serialized = roundTrip(source);
		assert.equal(serialized, source);
		assert.ok(PUBLIC_DOCTYPE.test(serialized), serialized);
		assert.equal(roundTrip(serialized), serialized);
	},
	'SYSTEM id after PUBLIC id can not inject an internal subset when serialized': function () {
		var source = '<!DOCTYPE x PUBLIC "pub" ' + INJECTED + '><x/>';
		var serialized = roundTrip(source);
		assert.equal(serialized, source);
		assert.ok(PUBLIC_DOCTYPE.test(serialized), serialized);
		assert.equal(roundTrip(serialized), serialized);
	},
	'SYSTEM id can not inject an internal subset when serialized': function () {
		var source = '<!DOCTYPE x SYSTEM ' + INJECTED + '><x/>';
		var serialized = roundTrip(source);
		assert.equal(serialized, source);
		assert.ok(SYSTEM_DOCTYPE.test(serialized), serialized);
		assert.equal(roundTrip(serialized), serialized);
	}
}).run();
