/*!
 * ribs
 * Copyright (c) 2013 Nicolas Gryman <ngryman@gmail.com>
 * LGPL Licensed
 */

#include "image_decoder.h"
#include "smart_buffer.h"
#include <leptonica/allheaders.h>

using namespace v8;
using namespace std;
using namespace ribs;

struct Baton {
	// data
	ImageDecoder::Result result;
	ImageDecoder::Callback callback;
	// fs stuff
	uv_fs_t fs;
	uv_file fd;
	uint8_t* buf;
	SmartBuffer buffer;
	// decoder stuff
	uv_work_t work;
};

static void OnOpen(uv_fs_t* req);
static void OnRead(uv_fs_t* req);
static void Close(uv_fs_t* req);
static void BeginDecode(Baton* baton);
static void DecodeAsync(uv_work_t* req);
static void OnDecoded(uv_work_t* req);
static void Done(Baton* baton);

#ifdef WIN32
#define PIX_READ pixRead
#else
#define PIX_READ pixReadMem
#endif

void ImageDecoder::Initialize(void) {
	// ensure that leptonica do read png alpha channel
	l_pngSetStripAlpha(0);
}

void ImageDecoder::Decode(const char* filename, ImageDecoder::Callback callback, NanCallback* jsCallback) {
	// create our Baton that will be passed over different uv calls
	Baton* baton = new Baton();
	baton->buf = NULL;
	// ensure error is empty
	baton->result.error[0] = 0;
	baton->result.filename = filename;
	baton->result.callback = jsCallback;
	baton->callback = callback;
	// reference baton in the request
	baton->fs.data = baton;

	// open the file async
#ifndef WIN32
	// use libuv to increase performance on *nix platform
	// on windows, leptonica does not support reading directly from memory:
	//  http://tpgit.github.io/UnOfficialLeptDocs/leptonica/README.html#gnu-runtime-functions-for-stream-redirection-to-memory
	uv_fs_open(uv_default_loop(), &baton->fs, baton->result.filename, O_RDONLY, 0, OnOpen);
#else
	// use leptonica directly
	BeginDecode(baton);
#endif
}

void OnOpen(uv_fs_t* req) {
	Baton* baton = static_cast<Baton*>(req->data);

	if (-1 == req->result) {
		RibsError(baton->result.error, "can't open file", uv_strerror(uv_last_error(uv_default_loop())));
		uv_fs_req_cleanup(req);
		return Done(baton);
	}

	// allocate temporary buffer
	baton->buf = new uint8_t[SmartBuffer::ChunkSize];
	if (NULL == baton->buf) {
		RibsError(baton->result.error, "can't open file", "not enough memory");
		Close(req);
		return Done(baton);
	}

	// stores file descriptor on read
	baton->fd = req->result;

	// read the file async
	uv_fs_req_cleanup(req);
	uv_fs_read(uv_default_loop(), &baton->fs, baton->fd, baton->buf, SmartBuffer::ChunkSize, 0, OnRead);
}

void OnRead(uv_fs_t* req) {
	Baton* baton = static_cast<Baton*>(req->data);

	if (-1 == req->result) {
		RibsError(baton->result.error, "can't read file", uv_strerror(uv_last_error(uv_default_loop())));
		Close(req);
		return Done(baton);
	}

	// copy data
	baton->buffer.append(baton->buf);

	// schedule a new read if all the buffer was read
	if (req->result == SmartBuffer::ChunkSize) {
		uv_fs_req_cleanup(req);
		uv_fs_read(uv_default_loop(), &baton->fs, baton->fd, baton->buf, SmartBuffer::ChunkSize, baton->buffer.size(), OnRead);
	}
	else {
		Close(req);
		BeginDecode(baton);
	}
}

void Close(uv_fs_t* req) {
	// clean previous request
	uv_fs_req_cleanup(req);

	Baton* baton = static_cast<Baton*>(req->data);

	// close file sync
	// it's a quick operation that does not need threading overhead
	int err = uv_fs_close(uv_default_loop(), req, baton->fd, NULL);

	// fail silently
	if (-1 == err) {
		// TODO: log warning
		//baton->result.error = RibsError("Error closing file", uv_strerror(uv_last_error(uv_default_loop())));
		uv_fs_req_cleanup(req);
	}
}

void BeginDecode(Baton* baton) {
	// reference baton in the request
	baton->work.data = baton;
	// pass the request to libuv to be run when a worker-thread is available to
	uv_queue_work(
		uv_default_loop(),
		&baton->work,
		DecodeAsync,
		(uv_after_work_cb)OnDecoded
	);
}

void DecodeAsync(uv_work_t* req) {
	Baton* baton = static_cast<Baton*>(req->data);

	// let leptonica fetch image data for us
	Pix* data = PIX_READ(baton->result.filename);

	// get rid of color maps
	if (pixGetColormap(data)) {
		Pix* rgbData = pixRemoveColormap(data, REMOVE_CMAP_TO_FULL_COLOR);
		pixDestroy(&data);
		data = rgbData;
	}

	// swap bytes on little-endian machines in order to be sure that we have RGBA quadruplets
//	pixEndianByteSwap(data);
	baton->result.data = data;
};

void OnDecoded(uv_work_t* req) {
	// check if image was decoded correctly
	// TODO: check will be done before this
	Baton* baton = static_cast<Baton*>(req->data);
	if (NULL == baton->result.data) {
		RibsError(baton->result.error, "can't decode file", "unknown image format");
	}

	Done(baton);
};

void Done(Baton* baton) {
	// forward result to the callback
	baton->callback(&baton->result);

	// free baton allocated memory
	if(baton->buf) delete[] baton->buf;
	delete baton;
}
