"use strict";(self.webpackChunkexcalidraw_animate=self.webpackChunkexcalidraw_animate||[]).push([[863],{863:function(e,r,t){t.r(r),t.d(r,{default:function(){return a}});var n=t(181);var a={subset:function(e,r,t,a){var o=e.hb_subset_input_create_or_fail();if(0===o)throw new Error("hb_subset_input_create_or_fail (harfbuzz) returned zero, indicating failure");var b=e.malloc(t.byteLength);r.set(new Uint8Array(t),b);var i=e.hb_blob_create(b,t.byteLength,2,0,0),_=e.hb_face_create(i,0);e.hb_blob_destroy(i);var u=e.hb_subset_input_set(o,6);e.hb_set_clear(u),e.hb_set_invert(u);var f,s,l=e.hb_subset_input_unicode_set(o),h=function(e,r){var t="undefined"!==typeof Symbol&&e[Symbol.iterator]||e["@@iterator"];if(!t){if(Array.isArray(e)||(t=(0,n.Z)(e))||r&&e&&"number"===typeof e.length){t&&(e=t);var a=0,o=function(){};return{s:o,n:function(){return a>=e.length?{done:!0}:{done:!1,value:e[a++]}},e:function(e){throw e},f:o}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var b,i=!0,_=!1;return{s:function(){t=t.call(e)},n:function(){var e=t.next();return i=e.done,e},e:function(e){_=!0,b=e},f:function(){try{i||null==t.return||t.return()}finally{if(_)throw b}}}}(a);try{for(h.s();!(f=h.n()).done;){var c=f.value;e.hb_set_add(l,c)}}catch(w){h.e(w)}finally{h.f()}try{if(0===(s=e.hb_subset_or_fail(_,o)))throw e.hb_face_destroy(_),e.free(b),new Error("hb_subset_or_fail (harfbuzz) returned zero, indicating failure. Maybe the input file is corrupted?")}finally{e.hb_subset_input_destroy(o)}var d=e.hb_face_reference_blob(s),y=e.hb_blob_get_data(d,0),v=e.hb_blob_get_length(d);if(0===v)throw e.hb_blob_destroy(d),e.hb_face_destroy(s),e.hb_face_destroy(_),e.free(b),new Error("Failed to create subset font, maybe the input file is corrupted?");var p=new Uint8Array(r.subarray(y,y+v));return e.hb_blob_destroy(d),e.hb_face_destroy(s),e.hb_face_destroy(_),e.free(b),p}}}}]);
//# sourceMappingURL=863.cdc212c9.chunk.js.map