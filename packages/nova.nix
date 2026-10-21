# Nova : nova-gateway (Hub), nova-daemon (poste), les connecteurs MCP et l'interface nova-home,
# construits depuis le même dépôt npm. Les tests unitaires et de contrat tournent à la construction.
{ lib, buildNpmPackage, importNpmLock, nodejs_22, makeWrapper }:
let
  root = ../.;
  src = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      ../package.json
      ../package-lock.json
      ../design
      ../companies/demo/data # données des tests de contrat
      ../verticals # skills métier des agents
      ./nova-server/package.json
      ./nova-server/tsconfig.json
      ./nova-server/src
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

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    npm test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    npm prune --omit=dev --no-audit --no-fund
    # Les liens des espaces de travail pointent vers les sources : on garde les vrais dossiers.
    rm -f node_modules/nova-server node_modules/nova-home
    lib=$out/lib/nova
    mkdir -p $lib/packages/nova-server $out/share
    cp -r node_modules $lib/
    cp -r packages/nova-server/dist packages/nova-server/package.json $lib/packages/nova-server/
    cp -r packages/nova-home/dist $out/share/nova-home
    cp -r verticals $out/share/nova-verticals
    makeWrapper ${nodejs_22}/bin/node $out/bin/nova-gateway --add-flags $lib/packages/nova-server/dist/gateway/main.js
    makeWrapper ${nodejs_22}/bin/node $out/bin/nova-daemon --add-flags $lib/packages/nova-server/dist/daemon/main.js
    runHook postInstall
  '';

  passthru.liveTests = "lib/nova/packages/nova-server/dist/connectors/live.test.js";

  meta.mainProgram = "nova-daemon";
}
