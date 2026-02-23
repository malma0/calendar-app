export function closeAllSheets(){
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
  const backdrop = document.getElementById("sheetBackdrop");
  if(backdrop) backdrop.hidden = true;
}

export function openSheet(sheetId){
  const backdrop = document.getElementById("sheetBackdrop");
  if(backdrop) backdrop.hidden = false;

  const el = document.getElementById(sheetId);
  if(el) el.classList.add("open");
}