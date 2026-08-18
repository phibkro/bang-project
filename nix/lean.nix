{ pkgs ? import (builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/ac62194c3917d5f474c1a844b6fd6da2db95077d.tar.gz";
    sha256 = "sha256-16KkgfdYqjaeRGBaYsNrhPRRENs0qzkQVUooNHtoy2w=";
  }) {}
}:
let
  leanVersion = "4.30.0";
  leanArchiveSha256 = "sha256-Ta10FBwsEZyhqmJmVr6DuOFCOK+6lycf178es/CBsxk=";
  leanArchive = pkgs.fetchurl {
    url = "https://github.com/leanprover/lean4/releases/download/v${leanVersion}/lean-${leanVersion}-linux.tar.zst";
    hash = leanArchiveSha256;
  };
in
pkgs.stdenv.mkDerivation {
  pname = "bang-lean";
  version = leanVersion;
  src = leanArchive;
  nativeBuildInputs = [ pkgs.autoPatchelfHook pkgs.zstd ];
  buildInputs = [ pkgs.stdenv.cc.cc.lib pkgs.gmp pkgs.zlib pkgs.libuv ];
  dontUnpack = true;
  installPhase = ''
    mkdir -p "$out"
    tar --use-compress-program="${pkgs.zstd}/bin/zstd" \
      -xf "$src" -C "$out" --strip-components=1
  '';
  autoPatchelfIgnoreMissingDeps = true;
  passthru = {
    inherit leanVersion leanArchiveSha256;
    importedModule = "Lean.Elab.Tactic.Omega";
    command = "lean";
  };
}
