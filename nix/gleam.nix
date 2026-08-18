let
  nixpkgsRevision = "0e251e24a4f24e036a084b6b4b2d2491af4167f4";
  nixpkgsSha256 = "118n3xlp9fyf52588yhxa0a5xyi0gchci09l0vblrm7m8zimvln8";
  nixpkgs = builtins.fetchTarball {
    url = "https://github.com/NixOS/nixpkgs/archive/${nixpkgsRevision}.tar.gz";
    sha256 = nixpkgsSha256;
  };
  pkgs = import nixpkgs { };
in
pkgs.buildEnv {
  name = "bang-gleam-beam";
  paths = [
    pkgs.gleam
    pkgs.beam29Packages.erlang
  ];
  passthru = {
    gleamVersion = pkgs.gleam.version;
    otpVersion = pkgs.beam29Packages.erlang.version;
  };
}
