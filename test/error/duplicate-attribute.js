var vows = require('vows');
var assert = require('assert');
var DOMParser = require('xmldom').DOMParser;
var ParseError = require('xmldom/sax').ParseError;

// CVE-2021-21366: an attribute name must not appear more than once in the same
// start-tag. xmldom used the first declaration of a namespace and the last value
// of any other attribute, so a document with duplicates did not keep its
// namespaces when it was parsed and serialized again.

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

function assertReportedRedefined(source, mimeType, qName) {
	var p = getTestParser();
	p.parser.parseFromString(source, mimeType);
	var reported = (p.errors.fatalError || []).filter(function (msg) {
		return msg.indexOf('Attribute ' + qName + ' redefined') >= 0;
	});
	assert.equal(reported.length, 1, mimeType + ' ' + source + ': ' + JSON.stringify(p.errors));
}

function assertThrowsParseError(source, mimeType, qName) {
	var thrown;
	try {
		new DOMParser().parseFromString(source, mimeType);
	} catch (e) {
		thrown = e;
	}
	assert.ok(thrown instanceof ParseError, mimeType + ' ' + source + ' should throw ParseError, got: ' + thrown);
	assert.ok(thrown instanceof Error);
	assert.equal(thrown.name, 'ParseError');
	assert.equal(thrown.message, 'Attribute ' + qName + ' redefined');
}

var MIME_TYPES = ['text/xml', 'text/html'];

vows.describe('duplicate attribute').addBatch({
	'duplicate attribute throws ParseError with the default errorHandler': function () {
		MIME_TYPES.forEach(function (mimeType) {
			assertThrowsParseError('<xml a="1" a="2"></xml>', mimeType, 'a');
		});
	},
	'duplicate default namespace declaration throws ParseError': function () {
		MIME_TYPES.forEach(function (mimeType) {
			assertThrowsParseError('<xml xmlns="http://a" xmlns="http://b"><child/></xml>', mimeType, 'xmlns');
		});
	},
	'duplicate prefixed namespace declaration throws ParseError': function () {
		MIME_TYPES.forEach(function (mimeType) {
			assertThrowsParseError('<p:xml xmlns:p="http://a" xmlns:p="http://b"><p:child/></p:xml>', mimeType, 'xmlns:p');
		});
	},
	'duplicate prefixed attribute throws ParseError': function () {
		assertThrowsParseError('<xml xmlns:p="http://a" p:a="1" p:a="2"/>', 'text/xml', 'p:a');
	},
	'ParseError carries the locator': function () {
		var thrown;
		try {
			new DOMParser({locator: {}}).parseFromString('<xml>\n<child a="1" a="2"/></xml>', 'text/xml');
		} catch (e) {
			thrown = e;
		}
		assert.ok(thrown instanceof ParseError, 'got: ' + thrown);
		assert.equal(thrown.locator.lineNumber, 2);
	},
	'duplicate attribute is reported as fatalError for every way of writing an attribute': function () {
		MIME_TYPES.forEach(function (mimeType) {
			// quoted values
			assertReportedRedefined('<xml a="1" a=\'2\'></xml>', mimeType, 'a');
			// values missing the start quote
			assertReportedRedefined('<xml a=1" a=2"></xml>', mimeType, 'a');
			// unquoted values, followed by space and by the end of the tag
			assertReportedRedefined('<xml a=1 a=2></xml>', mimeType, 'a');
			// unquoted values, followed by space and by a self closing tag
			assertReportedRedefined('<xml a=1 a=2 />', mimeType, 'a');
			// attributes without value
			assertReportedRedefined('<xml a a></xml>', mimeType, 'a');
			assertReportedRedefined('<xml a a />', mimeType, 'a');
			// attribute without value and with value
			assertReportedRedefined('<xml a a="1"></xml>', mimeType, 'a');
		});
	},
	'two arguments function errorHandler receives fatalError': function () {
		var errors = {};
		new DOMParser({
			errorHandler: function (key, msg) {
				errors[key] = msg;
			}
		}).parseFromString('<xml a="1" a="2"></xml>', 'text/xml');
		assert.ok(/Attribute a redefined/.test(errors.fatalError), JSON.stringify(errors));
	},
	'one argument function errorHandler receives fatalError': function () {
		var errors = [];
		new DOMParser({
			errorHandler: function (msg) {
				errors.push(msg);
			}
		}).parseFromString('<xml a="1" a="2"></xml>', 'text/xml');
		var fatal = errors.filter(function (msg) {
			return /^\[xmldom fatalError\]/.test(msg);
		});
		assert.equal(fatal.length, 1, JSON.stringify(errors));
		assert.ok(/Attribute a redefined/.test(fatal[0]), fatal[0]);
	},
	'distinct attributes are not reported': function () {
		var p = getTestParser();
		var doc = p.parser.parseFromString(
			'<xml xmlns="http://a" xmlns:p="http://p" xmlns:q="http://q" a="1" p:a="2" q:a="3"' +
			' constructor="c" toString="t" valueOf="v" hasOwnProperty="h"/>', 'text/xml');
		assert.deepEqual(p.errors, {}, JSON.stringify(p.errors));
		var el = doc.documentElement;
		assert.equal(el.namespaceURI, 'http://a');
		assert.equal(el.getAttribute('a'), '1');
		assert.equal(el.getAttributeNS('http://p', 'a'), '2');
		assert.equal(el.getAttributeNS('http://q', 'a'), '3');
		assert.equal(el.getAttribute('constructor'), 'c');
		assert.equal(el.getAttribute('toString'), 't');
		assert.equal(el.getAttribute('valueOf'), 'v');
		assert.equal(el.getAttribute('hasOwnProperty'), 'h');
	},
	'same attribute on different elements is not reported': function () {
		var p = getTestParser();
		p.parser.parseFromString('<xml a="1" xmlns="http://a"><child a="2" xmlns="http://b"/></xml>', 'text/xml');
		assert.deepEqual(p.errors, {}, JSON.stringify(p.errors));
	}
}).run();
