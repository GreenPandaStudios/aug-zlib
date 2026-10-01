#include "aug_native.h"
#include "zlib.h"
#include <stdlib.h>
#include <string.h>
#include <limits.h>
static int fail(aug_native_error_v1 *e,int code,const char *message){if(e){e->code=code;size_t n=strlen(message);if(n>512)n=512;e->message_length=(uint32_t)n;memcpy(e->message,message,n);}return code;}
AUG_EXPORT void aug_zlib_release_v1(void *p){free(p);}
AUG_EXPORT int32_t aug_zlib_compress_v1(const void *input,uint64_t length,void **out,uint64_t *count,aug_native_error_v1 *e){
 if(out)*out=NULL;if(count)*count=0;if(e)memset(e,0,sizeof(*e));if(!out||!count||(!input&&length)||length>268435456)return fail(e,Z_STREAM_ERROR,"Invalid or oversized input");
 uLong bound=compressBound((uLong)length);void *storage=malloc(bound?bound:1);if(!storage)return fail(e,Z_MEM_ERROR,"Out of memory");uLongf used=bound;
 int status=compress2(storage,&used,input?input:"",(uLong)length,Z_DEFAULT_COMPRESSION);if(status!=Z_OK){free(storage);return fail(e,status,zError(status));}*out=storage;*count=used;return 0;
}
AUG_EXPORT int32_t aug_zlib_decompress_v1(const void *input,uint64_t length,int64_t maximum,void **out,uint64_t *count,aug_native_error_v1 *e){
 if(out)*out=NULL;if(count)*count=0;if(e)memset(e,0,sizeof(*e));if(!out||!count||(!input&&length)||length>UINT_MAX||maximum<0||maximum>268435456)return fail(e,Z_STREAM_ERROR,"Invalid input or output limit");
 /* One extra byte distinguishes an exact-size result from output overflow. */
 size_t capacity=(size_t)maximum+1;void *storage=malloc(capacity);if(!storage)return fail(e,Z_MEM_ERROR,"Out of memory");z_stream stream={0};stream.next_in=(Bytef *)input;stream.avail_in=(uInt)length;stream.next_out=storage;stream.avail_out=(uInt)capacity;
 int status=inflateInit(&stream);if(status==Z_OK){status=inflate(&stream,Z_FINISH);if(status!=Z_STREAM_END||stream.total_out>(uLong)maximum||stream.avail_in!=0)status=Z_DATA_ERROR;else status=Z_OK;int ended=inflateEnd(&stream);if(status==Z_OK&&ended!=Z_OK)status=ended;}
 if(status!=Z_OK){free(storage);return fail(e,status,"Invalid compressed data or output exceeds maximumOutput");}*out=storage;*count=stream.total_out;return 0;
}
