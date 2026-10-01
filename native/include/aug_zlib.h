#include "aug_native.h"
#ifdef __cplusplus
extern "C" {
#endif
AUG_EXPORT int32_t aug_zlib_compress_v1(const void *, uint64_t, void **, uint64_t *, aug_native_error_v1 *) AUG_NOEXCEPT;
AUG_EXPORT void aug_zlib_release_v1(void *) AUG_NOEXCEPT;
AUG_EXPORT int32_t aug_zlib_decompress_v1(const void *, uint64_t, int64_t, void **, uint64_t *, aug_native_error_v1 *) AUG_NOEXCEPT;
AUG_EXPORT void aug_zlib_release_v1(void *) AUG_NOEXCEPT;
#ifdef __cplusplus
}
#endif
