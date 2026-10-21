# Nova : nova-daemon (API locale) + nova-home (interface), construits depuis le même dépôt npm.
{ lib, buildNpmPackage, importNpmLock, nodejs_22, makeWrapper }:
let
  root = ../.;
  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../design
      ./nova-daemon/package.json
      ./nova-daemon/tsconfig.json
      ./nova-daemon/src
      ./nova-home/package.json
      ./nova-home/tsconfig.json
      ./nova-home/vite.config.ts
      ./nova-home/index.html
      ./nova-home/src
    ];
  };
in
buildNpmPackage {
  pname = "nova";
  version = "0.1.0";
  inherit src;
  nodejs = nodejs_22;

  npmDeps = importNpmLock { npmRoot = src; };
  npmConfigHook = importNpmLock.npmConfigHook;

  nativeBuildInputs = [ makeWrapper ];

  # Les tests unitaires (règles d'autonomie) font partie de la construction.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/nova-daemon $out/share
    cp -r packages/nova-daemon/dist packages/nova-daemon/package.json $out/lib/nova-daemon/
    cp -r packages/nova-home/dist $out/share/nova-home
    makeWrapper ${nodejs_22}/bin/node $out/bin/nova-daemon --add-flags $out/lib/nova-daemon/dist/server.js
    runHook postInstall
  '';

  meta.mainProgram = "nova-daemon";
}
