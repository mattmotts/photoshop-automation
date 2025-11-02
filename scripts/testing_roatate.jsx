#target photoshop
app.bringToFront();

function replaceContents(absPath) {
    var d = new ActionDescriptor();
    d.putPath(charIDToTypeID("null"), new File(absPath));
    d.putInteger(stringIDToTypeID("pageNumber"), 1);
    executeAction(stringIDToTypeID("placedLayerReplaceContents"), d, DialogModes.NO);
}

function getBoundsPx(lyr) {
    var b = lyr.bounds;
    function px(u){ return u.as("px"); }
    var l=px(b[0]), t=px(b[1]), r=px(b[2]), btm=px(b[3]);
    return { l:l, t:t, r:r, b:btm, w:r-l, h:btm-t, cx:(l+r)/2, cy:(t+btm)/2 };
}

// Keep template angle; only scale uniformly + recenter
function normalizeToTarget(lyr, target) {
    var oldUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    app.activeDocument.activeLayer = lyr;
    var cur = getBoundsPx(lyr);

    if (cur.w > 0 && cur.h > 0) {
        // uniform scale so we don't skew the art
        var s = (target.w / cur.w) * 100;
        lyr.resize(s, s, AnchorPosition.MIDDLECENTER);
    }

    // recenter to the saved target position
    cur = getBoundsPx(lyr);
    lyr.translate(target.cx - cur.cx, target.cy - cur.cy);

    app.preferences.rulerUnits = oldUnits;
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) fn(layerSet.layers[i], i);
}

function exportPNG(outFile) {
    var o = new ExportOptionsSaveForWeb();
    o.format = SaveDocumentType.PNG;  // PNG-24
    o.PNG8 = false;
    o.transparency = true;
    o.interlaced = false;
    o.optimized = true;
    app.activeDocument.exportDocument(outFile, ExportType.SAVEFORWEB, o);
}

(function main(){
    if (!app.documents.length) { alert("Open your PSD first."); return; }

    var inFolder = Folder.selectDialog("Select the folder of designs");
    if (!inFolder) { alert("No input folder selected."); return; }
    var files = inFolder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files.length) { alert("No images found."); return; }

    var outFolder = Folder.selectDialog("Select the output folder for PNGs");
    if (!outFolder) { alert("No output folder selected."); return; }

    // Select your TEMPLATE group (two Smart Object layers) before running
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE group and run again.");
        return;
    }

    // Snapshot target bounds from the two template SO layers
    var soLayers = [], targets = [];
    forEachImmediateLayer(templateGroup, function(lyr){
        if (lyr.typename === "ArtLayer" && lyr.kind === LayerKind.SMARTOBJECT) {
            soLayers.push(lyr);
            targets.push(getBoundsPx(lyr));
        }
    });
    if (soLayers.length < 2) { alert("Template group must contain the two Smart Object layers."); return; }

    for (var i=0; i<files.length; i++) {
        var f = files[i]; if (!(f instanceof File)) continue;

        for (var s=0; s<soLayers.length; s++) {
            var lyr = soLayers[s];
            app.activeDocument.activeLayer = lyr;
            replaceContents(f.fsName);          // keeps your template’s rotation
            normalizeToTarget(lyr, targets[s]); // uniform scale + recenter
        }

        var base = f.name.replace(/\.[^\.]+$/, "");
        exportPNG(File(outFolder.fsName + "/" + base + ".png"));
    }

    alert("✅ Done! Exported " + files.length + " PNGs. Angle stays exactly as in your template.");
})();
