/* ============================================================
   Receiptly — js/image-utils.js
   ------------------------------------------------------------
   Small shared helper for turning an uploaded image file into a
   downscaled, compressed base64 data URL BEFORE it ever touches
   localStorage. A raw phone-camera photo can be several MB; as a
   base64 string that's ~33% bigger again, and localStorage's
   total quota (often only ~5-10MB, less on some mobile browsers)
   fills up fast — leading to uncaught QuotaExceededError the
   moment any subsequent save happens, and the image silently
   never getting persisted.

   This mirrors the resize pattern already used for the business
   logo in pages/settings.html, factored out so every other photo/
   logo upload spot in the app (admin avatar, admin company logo,
   admin user-edit avatar) can reuse the same safe behavior
   instead of each reinventing — or skipping — it.
   ============================================================ */

(function (global) {
  "use strict";

  // Resolves to a compressed JPEG data URL. Rejects with a plain
  // Error (readable message) if the file can't be read/decoded.
  function resizeToDataURL(file, maxDim, quality) {
    maxDim = maxDim || 480;
    quality = quality || 0.75;
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error("No file provided.")); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > h && w > maxDim) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else if (h >= w && h > maxDim) { w = Math.round(w * (maxDim / h)); h = maxDim; }
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          // Flatten any transparency onto white — PNG/WebP avatars
          // with alpha would otherwise turn black once re-encoded
          // as JPEG.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL("image/jpeg", quality));
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = function () { reject(new Error("That file could not be processed as an image.")); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error("Could not read that file.")); };
      reader.readAsDataURL(file);
    });
  }

  function isQuotaError(e) {
    return !!e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
  }

  global.ImageUtils = {
    resizeToDataURL: resizeToDataURL,
    isQuotaError: isQuotaError
  };
})(window);
