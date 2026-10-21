{ stdenvNoCC }:
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "nova-shell";
  version = "0.1.0";
  src = ./.;
  installPhase = ''
    dir=$out/share/gnome-shell/extensions/${finalAttrs.passthru.extensionUuid}
    mkdir -p $dir
    cp metadata.json extension.js stylesheet.css $dir/
  '';
  passthru.extensionUuid = "nova-shell@nova-os";
})
