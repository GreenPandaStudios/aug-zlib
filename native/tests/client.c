#include "aug_zlib.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>
int main(void){for(int i=0;i<1000;i++){
 const char input[]="The world runs on language";void *compressed=NULL,*restored=NULL;uint64_t compressed_length=0,length=0;aug_native_error_v1 error={0};
 assert(aug_zlib_compress_v1(input,sizeof(input)-1,&compressed,&compressed_length,&error)==0);
 assert(aug_zlib_decompress_v1(compressed,compressed_length,4096,&restored,&length,&error)==0&&length==sizeof(input)-1&&memcmp(input,restored,length)==0);aug_zlib_release_v1(restored);restored=NULL;
 assert(aug_zlib_decompress_v1(compressed,compressed_length,2,&restored,&length,&error)!=0&&restored==NULL);
 assert(aug_zlib_decompress_v1(compressed,compressed_length-1,4096,&restored,&length,&error)!=0&&restored==NULL);aug_zlib_release_v1(compressed);
 compressed=NULL;assert(aug_zlib_compress_v1(NULL,0,&compressed,&compressed_length,&error)==0);
 assert(aug_zlib_decompress_v1(compressed,compressed_length,0,&restored,&length,&error)==0&&length==0);aug_zlib_release_v1(restored);aug_zlib_release_v1(compressed);
 }puts("zlib: round trip, empty input, bounds, truncation and 1000 cleanup cycles passed");}
