var vows = require('vows');
var assert = require('assert');
var xmldom = require('xmldom');
var DOMParser = xmldom.DOMParser;
var DOMHandler = xmldom.__DOMHandler;
var ParseError = require('xmldom/sax').ParseError;

// ParseError is the error that is not caught by XMLReader (the SAX parser),
// so a fatalError reported while parsing stops the parsing process.

/**
 * A DOMHandler that collects all reported warnings, errors and fatal errors
 * and throws an instance of ErrorClass in the method named throwingMethod.
 */
function StubDOMHandler(throwingMethod, ErrorClass) {
	DOMHandler.call(this);
	var reported = this.reported = [];
	'warning,error,fatalError'.replace(/\w+/g, function (level) {
		this[level] = function (msg) {
			reported.push(level + ': ' + msg);
		};
	}.bind(this));
	if (throwingMethod) {
		this[throwingMethod] = function () {
			throw new ErrorClass('StubDOMHandler throwing in ' + throwingMethod);
		};
	}
}
StubDOMHandler.prototype = new DOMHandler();

var ALL_METHODS = '<?xml version="1.0"?>\n' +
	'<!DOCTYPE root>\n' +
	'<root xmlns="namespace">\n' +
	'  <!-- comment -->\n' +
	'  <![CDATA[ raw ]]>\n' +
	'  <element xmlns:x="http://test" x:a="" warning>character</element>\n' +
	'  <element duplicate="" duplicate="fatal"></element>\n' +
	'</root>';

// methods XMLReader calls inside of the try/catch of the parsing loop
var CAUGHT_METHODS = ['processingInstruction', 'startDTD', 'startElement', 'endElement',
	'comment', 'startCDATA', 'endCDATA', 'warning', 'fatalError'];

var batch = {
	'should have name ParseError': function () {
		assert.equal(new ParseError('').name, 'ParseError');
	},
	'should be an instance of Error': function () {
		assert.ok(new ParseError('') instanceof Error);
	},
	'should be an instance of ParseError': function () {
		assert.ok(new ParseError('') instanceof ParseError);
	},
	'should store first argument as message': function () {
		assert.equal(new ParseError('FROM TEST').message, 'FROM TEST');
	},
	'should store second argument as locator': function () {
		var locator = {};
		assert.strictEqual(new ParseError('', locator).locator, locator);
	},
	'should have correct StackTrace': function () {
		var error = new ParseError('MESSAGE');
		var stack = error.stack && error.stack.split(/[\n\r]+/);
		assert.ok(stack && stack.length > 1, error.stack);
		assert.equal(stack[0], 'ParseError: MESSAGE');
		assert.ok(stack[1].indexOf(__filename) >= 0, stack[1]);
	},
	'Error should not be instanceof ParseError': function () {
		assert.ok(!(new Error() instanceof ParseError));
	},
	'StubDOMHandler reports without throwing': function () {
		var domBuilder = new StubDOMHandler();
		var doc = new DOMParser({domBuilder: domBuilder, locator: {}}).parseFromString(ALL_METHODS, 'text/xml');
		assert.equal(doc.documentElement.tagName, 'root');
		assert.ok(domBuilder.reported.some(function (msg) {
			return /^warning: /.test(msg);
		}), JSON.stringify(domBuilder.reported));
		assert.ok(domBuilder.reported.some(function (msg) {
			return /^fatalError: Attribute duplicate redefined/.test(msg);
		}), JSON.stringify(domBuilder.reported));
	}
};

CAUGHT_METHODS.forEach(function (method) {
	batch['when DOMHandler.' + method + ' throws ParseError, it is not caught'] = function () {
		var thrown;
		try {
			new DOMParser({
				domBuilder: new StubDOMHandler(method, ParseError),
				locator: {}
			}).parseFromString(ALL_METHODS, 'text/xml');
		} catch (e) {
			thrown = e;
		}
		assert.ok(thrown instanceof ParseError, 'got: ' + thrown);
		assert.equal(thrown.message, 'StubDOMHandler throwing in ' + method);
	};
	batch['when DOMHandler.' + method + ' throws Error, it is caught and reported'] = function () {
		var domBuilder = new StubDOMHandler(method, Error);
		new DOMParser({domBuilder: domBuilder, locator: {}}).parseFromString(ALL_METHODS, 'text/xml');
		assert.ok(domBuilder.reported.some(function (msg) {
			return msg.indexOf('error: element parse error: Error: StubDOMHandler throwing in ' + method) === 0;
		}), JSON.stringify(domBuilder.reported));
	};
});

vows.describe('ParseError').addBatch(batch).run();
