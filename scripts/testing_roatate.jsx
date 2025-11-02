#target photoshop
app.bringToFront();

function replaceContents(absPath) {
    var d = new ActionDescriptor();
    d.putPath(charIDToTypeID("null"), new File(absPath));
    d.putInteger(stringIDToTypeID("pageNumber"), 1);
    executeAction(stringIDToTypeID("placedLayerReplaceContents"), d, DialogModes.NO);
}

// --- Snap the replaced SO to the exact saved rectangle (no drift) ---
function normalizeToTarget(lyr, target) {
    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    app.activeDocument.activeLayer = lyr;

    // 1) measure current bounds
    var b = lyr.bounds;
    function px(u){ return u.as("px"); }
    var l=px(b[0]), t=px(b[1]), r=px(b[2]), btm=px(b[3]);
    var w = r - l, h = btm - t;

    // 2) scale to match target exactly (allow non-uniform)
    if (w > 0 && h > 0) {
        var sx = (target.w / w) * 100;
        var sy = (target.h / h) * 100;
        // resize from top-left so we can pin the corner later
        lyr.resize(sx, sy, AnchorPosition.TOPLEFT);
    }

    // 3) move top-left corner to target top-left (no center rounding)
    // re-read bounds after resize
    b = lyr.bounds;
    l=px(b[0]); t=px(b[1]);
    var dx = target.l - l;
    var dy = target.t - t;
    if (dx || dy) lyr.translate(dx, dy);  // fractional px allowed

    app.preferences.rulerUnits = oldUnits;
}

function getBoundsPx(lyr) {
    var b = lyr.bounds;
    function px(u){ return u.as("px"); }
    var l=px(b[0]), t=px(b[1]), r=px(b[2]), btm=px(b[3]);
    return { l:l, t:t, r:r, b:btm, w:r-l, h:btm-t, cx:(l+r)/2, cy:(t+btm)/2 };
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) fn(layerSet.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG;
    o.PNG8 = false;
    o.transparency = true;
    o.interlaced = false;
    o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

(function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    var inFolder = Folder.selectDialog("Select the folder of designs to place");
    if (!inFolder) { alert("No input folder selected."); return; }
    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found."); return; }

    var outFolder = Folder.selectDialog("Select the output folder for PNGs");
    if (!outFolder) { alert("No output folder selected."); return; }

    // User must select the TEMPLATE group first
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group (the one with the two Smart Object layers) and run again.");
        return;
    }

    // Record your Smart Object layers’ ideal positions and sizes once
    var soLayers = [], targets = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) {
            soLayers.push(lyr);
            targets.push(getBoundsPx(lyr)); // capture exact placement
        }
    });
    if (soLayers.length < 2) {
        alert("Template group must contain the two Smart Object layers (Normal & Multiply).");
        return;
    }

    // Iterate over every design in the folder
    for (var i=0; i<files.length; i++) {
        var f = files[i];
        if (!(f instanceof File)) continue;

        for (var s=0; s<soLayers.length; s++) {
            var lyr = soLayers[s];
            app.activeDocument.activeLayer = lyr;

            // Replace image + re-align precisely
            replaceContents(f.fsName);
            normalizeToTarget(lyr, targets[s]);
        }

        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    alert("✅ Done! Exported " + files.length + " perfectly aligned PNGs.");
})();
