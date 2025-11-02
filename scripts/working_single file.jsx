#target photoshop
app.bringToFront();

function replaceLayerContents(filePath) {
    var id = stringIDToTypeID("placedLayerReplaceContents");
    var d = new ActionDescriptor();
    d.putPath(charIDToTypeID("null"), new File(filePath));
    d.putInteger(stringIDToTypeID("pageNumber"), 1);
    executeAction(id, d, DialogModes.NO);
}

function convertActiveToSmartObjectIfNeeded() {
    var lyr = app.activeDocument.activeLayer;
    if (lyr.kind !== LayerKind.SMARTOBJECT) {
        // Convert selected layer to Smart Object
        executeAction(stringIDToTypeID('newPlacedLayer'), new ActionDescriptor(), DialogModes.NO);
    }
}

function forEachImmediateLayer(layerSet, fn) {
    for (var i = 0; i < layerSet.layers.length; i++) {
        fn(layerSet.layers[i]);
    }
}

function main() {
    // 1) Ask for folder
    var folder = Folder.selectDialog("Select the folder of images to place");
    if (!folder) {
        alert("No folder selected.");
        return;
    }

    // 2) Require the user to select the TEMPLATE GROUP first
    var templateGroup = app.activeDocument.activeLayer;
    if (!templateGroup || templateGroup.typename !== "LayerSet") {
        alert("Select your TEMPLATE GROUP (the one with the two layers) before running.");
        return;
    }

    // 3) Collect files
    var files = folder.getFiles(/\.(png|jpg|jpeg|tif|tiff)$/i);
    if (!files || files.length === 0) {
        alert("No images found in that folder.");
        return;
    }

    // 4) For each file: duplicate group, replace contents on each child layer
    for (var f = 0; f < files.length; f++) {
        var file = files[f];
        if (!(file instanceof File)) continue;

        var newGroup = templateGroup.duplicate();
        newGroup.name = file.name.replace(/\.[^\.]+$/, "");

        // Replace on each immediate child layer in the group
        forEachImmediateLayer(newGroup, function (lyr) {
            if (lyr.typename === "LayerSet") return; // skip subgroups if any
            app.activeDocument.activeLayer = lyr;
            // Ensure smart object so we can replace contents
            convertActiveToSmartObjectIfNeeded();
            replaceLayerContents(file.fsName);
            // Blend modes/opacity/position come from the duplicated template layer
        });
    }

    alert("✅ Done! Created a group per image, preserving placement & effects.");
}

try { main(); } catch (e) { alert("Error: " + e); }
