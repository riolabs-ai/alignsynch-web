/* AlignSynch website v2 (R0): behavior only, the mobile menu. No animation code; the hero fade is CSS and honours prefers-reduced-motion. */
(function(){
  var mb=document.querySelector('.menu-btn'), sheet=document.getElementById('msheet');
  if(mb&&sheet){mb.addEventListener('click',function(){var o=mb.getAttribute('aria-expanded')==='true';mb.setAttribute('aria-expanded',String(!o));sheet.hidden=o;});}
})();
