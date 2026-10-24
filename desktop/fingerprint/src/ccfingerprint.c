/* ccfingerprint - the fingerprint step, as a proxy version.dll.
 *
 * The Claude Desktop exe stores app.asar's expected SHA-256 and refuses to run
 * when the archive no longer matches (which is exactly what our injection
 * does). This DLL, placed beside the exe, is loaded in its place before the
 * real version.dll (the loader searches the exe's own folder first), so its
 * DllMain runs at startup. It then, in the running process's own memory only,
 * finds the expected hash string the exe carries
 * ("alg":"SHA256","value":"<64 hex>") and overwrites it with the hash we
 * recompute from the app.asar on disk - so the exe's own check passes.
 *
 * Nothing on disk is changed; another process (an unpatched Claude) is not
 * affected. Every real version.dll export is forwarded to the system DLL, so
 * callers see the genuine API.
 *
 * This only works from a NORMAL directory (our patched copy). Inside the
 * installed MSIX, Windows Code Integrity Guard (MicrosoftSignedOnly) would
 * reject an unsigned DLL and kill the process - which is why the app is patched
 * as a copy, never in place. Built by desktop/fingerprint/build.ps1; the repo
 * also ships the prebuilt version.dll so no compiler is needed to install.
 */
#include <windows.h>
#include <bcrypt.h>
#include <psapi.h>
#include <string.h>
#include <stdio.h>
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "psapi.lib")

/* Forward every export of the real version.dll to the system copy, so the DLL
   is a transparent stand-in. Ordinals match version.dll on Windows 10/11. */
#define SYS "C:\\Windows\\System32\\version"
#pragma comment(linker, "/export:GetFileVersionInfoA="        SYS ".GetFileVersionInfoA,@1")
#pragma comment(linker, "/export:GetFileVersionInfoByHandle=" SYS ".GetFileVersionInfoByHandle,@2")
#pragma comment(linker, "/export:GetFileVersionInfoExA="      SYS ".GetFileVersionInfoExA,@3")
#pragma comment(linker, "/export:GetFileVersionInfoExW="      SYS ".GetFileVersionInfoExW,@4")
#pragma comment(linker, "/export:GetFileVersionInfoSizeA="    SYS ".GetFileVersionInfoSizeA,@5")
#pragma comment(linker, "/export:GetFileVersionInfoSizeExA="  SYS ".GetFileVersionInfoSizeExA,@6")
#pragma comment(linker, "/export:GetFileVersionInfoSizeExW="  SYS ".GetFileVersionInfoSizeExW,@7")
#pragma comment(linker, "/export:GetFileVersionInfoSizeW="    SYS ".GetFileVersionInfoSizeW,@8")
#pragma comment(linker, "/export:GetFileVersionInfoW="        SYS ".GetFileVersionInfoW,@9")
#pragma comment(linker, "/export:VerFindFileA="               SYS ".VerFindFileA,@10")
#pragma comment(linker, "/export:VerFindFileW="               SYS ".VerFindFileW,@11")
#pragma comment(linker, "/export:VerInstallFileA="            SYS ".VerInstallFileA,@12")
#pragma comment(linker, "/export:VerInstallFileW="            SYS ".VerInstallFileW,@13")
#pragma comment(linker, "/export:VerLanguageNameA="           SYS ".VerLanguageNameA,@14")
#pragma comment(linker, "/export:VerLanguageNameW="           SYS ".VerLanguageNameW,@15")
#pragma comment(linker, "/export:VerQueryValueA="             SYS ".VerQueryValueA,@16")
#pragma comment(linker, "/export:VerQueryValueW="             SYS ".VerQueryValueW,@17")

#define HASH_LEN 32
#define HEX_LEN 64

/* SHA-256 of app.asar's header JSON (the first pickle names its length). */
static int asar_header_hash(const char *asar, char hex[HEX_LEN + 1]) {
    FILE *f = fopen(asar, "rb");
    if (!f) return 0;
    unsigned char pre[16];
    if (fread(pre, 1, 16, f) != 16) { fclose(f); return 0; }
    DWORD len = *(DWORD *)(pre + 12);
    unsigned char *buf = (unsigned char *)malloc(len);
    if (!buf) { fclose(f); return 0; }
    if (fread(buf, 1, len, f) != len) { free(buf); fclose(f); return 0; }
    fclose(f);

    BCRYPT_ALG_HANDLE alg = NULL; BCRYPT_HASH_HANDLE h = NULL;
    unsigned char dig[HASH_LEN]; int ok = 0;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, NULL, 0) == 0) {
        if (BCryptCreateHash(alg, &h, NULL, 0, NULL, 0, 0) == 0) {
            if (BCryptHashData(h, buf, len, 0) == 0 &&
                BCryptFinishHash(h, dig, HASH_LEN, 0) == 0) {
                for (int i = 0; i < HASH_LEN; i++) sprintf(hex + i * 2, "%02x", dig[i]);
                hex[HEX_LEN] = 0; ok = 1;
            }
            BCryptDestroyHash(h);
        }
        BCryptCloseAlgorithmProvider(alg, 0);
    }
    free(buf);
    return ok;
}

/* The 64 hex chars after the sentinel, in this process's own exe image. */
static char *find_hash_slot(void) {
    MODULEINFO mi;
    if (!GetModuleInformation(GetCurrentProcess(), GetModuleHandle(NULL), &mi, sizeof mi)) return NULL;
    const char *sentinel = "\"alg\":\"SHA256\",\"value\":\"";
    size_t slen = strlen(sentinel), n = mi.SizeOfImage;
    BYTE *base = (BYTE *)mi.lpBaseOfDll;
    for (size_t i = 0; i + slen + HEX_LEN <= n; i++)
        if (memcmp(base + i, sentinel, slen) == 0) return (char *)(base + i + slen);
    return NULL;
}

static void patch_hash(void) {
    char *slot = find_hash_slot();
    if (!slot) return;

    char exe[MAX_PATH];
    GetModuleFileNameA(NULL, exe, MAX_PATH);
    char *slash = strrchr(exe, '\\');
    if (!slash) return;
    strcpy(slash + 1, "resources\\app.asar");

    char actual[HEX_LEN + 1];
    if (!asar_header_hash(exe, actual)) return;
    if (memcmp(slot, actual, HEX_LEN) == 0) return;   /* already matches */

    DWORD old;
    if (VirtualProtect(slot, HEX_LEN, PAGE_EXECUTE_READWRITE, &old)) {
        memcpy(slot, actual, HEX_LEN);
        VirtualProtect(slot, HEX_LEN, old, &old);
    }
}

BOOL APIENTRY DllMain(HMODULE mod, DWORD reason, LPVOID reserved) {
    (void)mod; (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) patch_hash();
    return TRUE;
}
