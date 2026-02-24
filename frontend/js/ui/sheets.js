export function closeAllSheets(){
  document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));

  const backdrop = document.getElementById("sheetBackdrop");
  if(!backdrop) return;

  // плавно гасим затемнение
  backdrop.classList.remove("visible");

  // прячем после анимации
  window.setTimeout(() => {
    backdrop.hidden = true;
  }, 280);
}

export function openSheet(sheetId){
  const backdrop = document.getElementById("sheetBackdrop");
  if(backdrop){
    backdrop.hidden = false;
    // чтобы transition отработал корректно
    requestAnimationFrame(() => backdrop.classList.add("visible"));
  }

  const el = document.getElementById(sheetId);
  if(el){
    // на всякий случай снимаем hidden, если он есть
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("open"));
  }
}
