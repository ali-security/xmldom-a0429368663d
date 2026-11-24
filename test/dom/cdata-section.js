var vows = require('vows');
var assert = require('assert');
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;
var dom = require('xmldom/dom');
var DOMImplementation = dom.DOMImplementation;
var DOMException = dom.DOMException;

// CVE-2026-34601: createCDATASection accepted data containing the CDATA terminator
// "]]>", which the serializer wrote out as is, so the rest of the data became live
// markup (XML injection). It now throws InvalidCharacterError, as the DOM spec requires.
// https://github.com/xmldom/xmldom/security/advisories/GHSA-wh4c-j3r5-mjhp

// the code is a literal so the vows report the missing check (and not a
// TypeError) when DOMException codes are not exported
var INVALID_CHARACTER_ERR = 5;

function createDocument() {
	return new DOMImplementation().createDocument(null, 'xml');
}

function assertThrowsDOMException(code, fn) {
	var thrown = null;
	try {
		fn();
	} catch (e) {
		thrown = e;
	}
	assert.ok(thrown, 'expected a DOMException with code ' + code + ' to be thrown');
	assert.strictEqual(thrown.code, code, 'unexpected exception: ' + thrown);
	return thrown;
}

vows.describe('Document.prototype.createCDATASection').addBatch({
	'DOMException exports INVALID_CHARACTER_ERR': function () {
		assert.strictEqual(DOMException.INVALID_CHARACTER_ERR, INVALID_CHARACTER_ERR);
	},
	'throws InvalidCharacterError when data is exactly "]]>"': function () {
		var doc = createDocument();
		assertThrowsDOMException(INVALID_CHARACTER_ERR, function () {
			doc.createCDATASection(']]>');
		});
	},
	'throws InvalidCharacterError when data starts with safe content then contains "]]>"': function () {
		var doc = createDocument();
		assertThrowsDOMException(INVALID_CHARACTER_ERR, function () {
			doc.createCDATASection('safe]]>data');
		});
	},
	'throws InvalidCharacterError when data contains multiple "]]>" occurrences': function () {
		var doc = createDocument();
		assertThrowsDOMException(INVALID_CHARACTER_ERR, function () {
			doc.createCDATASection('before]]>after]]>after');
		});
	},
	'does not create an injectable CDATASection from attacker data': function () {
		var doc = new DOMImplementation().createDocument(null, 'root', null);
		assertThrowsDOMException(INVALID_CHARACTER_ERR, function () {
			doc.documentElement.appendChild(doc.createCDATASection(']]><injected/><![CDATA['));
		});
		var xml = new XMLSerializer().serializeToString(doc);
		assert.strictEqual(xml, '<root/>');
		var reparsed = new DOMParser().parseFromString(xml, 'text/xml');
		assert.strictEqual(reparsed.getElementsByTagName('injected').length, 0);
	}
}).addBatch({
	'does not throw when data is safe': function () {
		var cdata = createDocument().createCDATASection('safe');
		assert.strictEqual(cdata.data, 'safe');
		assert.strictEqual(cdata.nodeType, 4);
	},
	'does not throw when data is empty string': function () {
		var cdata = createDocument().createCDATASection('');
		assert.strictEqual(cdata.data, '');
	},
	'does not throw for data containing "]]" or ">" apart': function () {
		var cdata = createDocument().createCDATASection('a]]b>c]>');
		assert.strictEqual(cdata.data, 'a]]b>c]>');
	}
}).addBatch({
	'parsing XML containing a CDATA section does not throw': function () {
		var doc = new DOMParser().parseFromString('<root><![CDATA[some data]]></root>', 'text/xml');
		var cdata = doc.documentElement.firstChild;
		assert.strictEqual(cdata.nodeType, 4);
		assert.strictEqual(cdata.data, 'some data');
	}
}).run();
