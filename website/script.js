const menuButton=document.querySelector("[data-menu-button]");
const nav=document.querySelector("[data-nav]");

menuButton?.addEventListener("click",()=>{
  const open=menuButton.getAttribute("aria-expanded")==="true";
  menuButton.setAttribute("aria-expanded",String(!open));
  nav?.classList.toggle("open",!open);
});

nav?.querySelectorAll("a").forEach(link=>{
  link.addEventListener("click",()=>{
    menuButton?.setAttribute("aria-expanded","false");
    nav.classList.remove("open");
  });
});

const sections=[...document.querySelectorAll("section[id]")];
const navLinks=[...(nav?.querySelectorAll("a[href^='#']")||[])];
if("IntersectionObserver" in window){
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      navLinks.forEach(link=>link.classList.toggle("active",link.getAttribute("href")===`#${entry.target.id}`));
    });
  },{rootMargin:"-35% 0px -55%",threshold:0});
  sections.forEach(section=>observer.observe(section));
}
