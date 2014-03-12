/*!
 * ribs
 * Copyright (c) 2013-2014 Nicolas Gryman <ngryman@gmail.com>
 * LGPL Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var open = require('../../../lib/operations/open'),
	save = require('../../../lib/operations/save'),
	Image = require('../../..').Image,
	fs = require('fs'),
	path = require('path');

/**
 * Tests constants.
 */

var SRC_DIR = path.resolve(__dirname + '/../../fixtures/'),
	TMP_DIR = path.join(SRC_DIR, 'tmp/');

/**
 * Tests helper functions.
 */

var testSaveParams = helpers.testOperationParams(save);
var testSaveImage = helpers.testOperationImage(save, { filename: '' });
var testSaveNext = helpers.testOperationNext(save, { filename: '' });

var testSave = curry(function(filename, quality, progressive, done) {
	var stream, dstFilename;

	if ('string' == typeof filename) {
		filename = path.join(SRC_DIR, filename);

		// append `-save` to filename in order to avoid conflicts
		dstFilename = path.join(TMP_DIR, filename);
		dstFilename = filename.replace(/\.(jpg|png|gif)$/, '-save.$1');
	}
	else if ('function' == typeof filename) {
		stream = filename();
		filename = stream.path
			.replace('tmp/', '')
			.replace('-save', '');
		dstFilename = stream.path;
	}

	open(filename, null, function(err, image) {
		var params = {
			quality: quality,
			progressive: progressive
		};

		if (!stream)
			params.filename = dstFilename;
		else
			params.stream = stream;

		save(params, null, image, function(err, image) {
			should.not.exist(err);

			fs.existsSync(dstFilename).should.be.true;
			open(dstFilename, null, function(err, savedImage) {
				helpers.similarity(savedImage, image).should.be.true;
				fs.unlinkSync(dstFilename);
				done();
			});
		});
	});
});

/**
 * Test suite.
 */

describe('save operation', function() {
	before(function() {
		try { fs.mkdirSync(TMP_DIR); }
		catch(err) { /* let cry */ }
	});

	after(function() {
		try { fs.rmdirSync(TMP_DIR); }
		catch(err) { /* let cry */ }
	});

	describe('(params, hooks, image, next)', function() {
		it('should fail when params has an invalid type', testSaveParams(
			'', ['string', 'object'], false, null
		));

		it('should fail when params.filename has an invalid type', testSaveParams(
			'filename', ['string'], false, {}
		));

		it('should accept a writable stream', testSave(
			fs.createWriteStream.bind(null, path.join(TMP_DIR, '0124-save.png')), 0, true
		));

		it('should fail when params.filename does not have an extension', function(done) {
			save({ filename: '/dev/null' }, null, new Image(), function(err) {
				helpers.checkError(err, 'invalid filename: /dev/null');
				done();
			});
		});

		it('should fail when params.quality has an invalid type', testSaveParams(
			'quality', ['number'], true, { filename: '' }
		));

		it('should fail when params.progressive has an invalid type', testSaveParams(
			'progressive', ['boolean'], true, { filename: '' }
		));

		it('should fail when image has an invalid type', testSaveImage());

		it('should fail when image is not an instance of Image', function(done) {
			save({ filename: 'yolo.jpg' }, null, {}, function(err) {
				helpers.checkError(err, 'invalid type: image should be an instance of Image');
				done();
			});
		});

		it('should fail when image is an empty image', function(done) {
			save({ filename: 'yolo.jpg' }, null, new Image(), function(err) {
				helpers.checkError(err, 'empty image');
				done();
			});
		});

		it('should fail when next has an invalid type', testSaveNext());
	});

	describe('with jpg files', function() {
		it('should save when quality is 100%', testSave('01100.jpg', 100, false));

		it('should save when quality is 50%', testSave('0150.jpg', 50, false));

		it('should save when quality is 0%', testSave('010.jpg', 0, false));

		it('should save when progressive and quality is 100%', testSave('01100p.jpg', 100, true));

		it('should save when progressive and quality is 50%', testSave('0150p.jpg', 50, true));

		it('should save when progressive and quality is 0%', testSave('010p.jpg', 0, true));
	});

	describe('with png files', function() {
		it('should save 8-bit', testSave('018.png', 0, false));

		// seems buggy for 8-bit PNG with alpha channel, posted a question here:
		//   http://answers.opencv.org/question/28220/alpha-channel-for-8-bit-png/
		xit('should save 8-bit with alpha channel', testSave('018a.png', 0, false));
		xit('should open interlaced 8-bit with alpha channel', testSave('018ai.png', 0, false));

		it('should save 24-bit when quality is 100', testSave('0124.png', 100, false));

		it('should save 24-bit when quality is 50', testSave('0124.png', 50, false));

		it('should save 24-bit when quality is 0', testSave('0124.png', 0, false));

		it('should save 24-bit with alpha channel when quality is 100', testSave('0124a.png', 100, false));

		it('should save 24-bit with alpha channel when quality is 50', testSave('0124a.png', 50, false));

		it('should save 24-bit with alpha channel when quality is 0', testSave('0124a.png', 0, false));

		it('should save interlaced 24-bit with alpha channel when quality is 100', testSave('0124ai.png', 100, false));

		it('should save interlaced 24-bit with alpha channel when quality is 50', testSave('0124ai.png', 50, false));

		it('should save interlaced 24-bit with alpha channel when quality is 0', testSave('0124ai.png', 0, false));
	});

	// gif are not supported by OCV
	//   http://stackoverflow.com/questions/11494119/error-in-opencv-2-4-2-opencv-error-bad-flag
	xdescribe('with gif files', function() {
		it('should save standard', testSave('01.gif', 0, false));

		it('should save interlaced', testSave('01i.gif', 0, false));

		it('should save with alpha channel', testSave('01a.gif', 0, false));

		it('should save interlaced with alpha channel', testSave('01ai.gif', 0, false));
	});
});