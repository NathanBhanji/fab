cmake_minimum_required(VERSION 3.22.1)

project(fabhighlights LANGUAGES C)

set(FAB_HIGHLIGHTS_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../..")

add_library(
  fabhighlights SHARED
  fab_highlights_jni.c
  "${FAB_HIGHLIGHTS_ROOT}/cpp/fab_highlights.c"
  "${FAB_HIGHLIGHTS_ROOT}/Vendor/highlights/highlights.c"
  "${FAB_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-impl.c"
  "${FAB_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-mem-impl.c"
)

target_include_directories(
  fabhighlights
  PRIVATE "${FAB_HIGHLIGHTS_ROOT}/cpp" "${FAB_HIGHLIGHTS_ROOT}/Vendor"
          "${FAB_HIGHLIGHTS_ROOT}/Vendor/highlights" "${FAB_HIGHLIGHTS_ROOT}/Vendor/wasm2c"
)

# Plain malloc memory with explicit bounds checks: no guard-page signal
# handlers competing with ART's.
target_compile_definitions(
  fabhighlights PRIVATE WASM_RT_USE_MMAP=0 WASM_RT_MEMCHECK_BOUNDS_CHECK=1
                       WASM_RT_SKIP_SIGNAL_RECOVERY=1
)

# The lexers are generated code; keep them fast in debug builds too.
target_compile_options(fabhighlights PRIVATE -O2)

target_link_options(
  fabhighlights PRIVATE "-Wl,-z,common-page-size=16384" "-Wl,-z,max-page-size=16384"
)
