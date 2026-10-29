const conditions={A:{title:"Homogeneous panel, discussion only",panel:"Gemma × 3",report:"No joint report",checkpoints:"T0 and T6",copy:"Three deployments from the same declared model family complete the bounded discussion without a downstream joint-report workflow."},B:{title:"Homogeneous panel, joint report",panel:"Gemma × 3",report:"Draft, two reviews, revision",checkpoints:"T0, T6, and TR",copy:"The report requirement appears after every baseline checkpoint commits. Two reviewers inspect the same first draft independently before revision."},C:{title:"Mixed panel, discussion only",panel:"Gemma + Gemini + Model X",report:"No joint report",checkpoints:"T0 and T6",copy:"A declared mixed-model panel completes the same six-round workshop without the additional report workflow."},D:{title:"Mixed panel, joint report",panel:"Gemma + Gemini + Model X",report:"Draft, two reviews, revision",checkpoints:"T0, T6, and TR",copy:"The mixed-model panel completes the workshop and the frozen report workflow, with private checkpoints preserved as separate evidence."}};
const conditionButtons=document.querySelectorAll("[data-condition]");
const conditionName=document.querySelector("[data-condition-name]");
const conditionTitle=document.querySelector("[data-condition-title]");
const panel=document.querySelector("[data-panel]");
const report=document.querySelector("[data-report]");
const checkpoints=document.querySelector("[data-checkpoints]");
const conditionCopy=document.querySelector("[data-condition-copy]");
conditionButtons.forEach(button=>{button.addEventListener("click",()=>{const key=button.dataset.condition;const data=conditions[key];conditionButtons.forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active))});conditionName.textContent=key;conditionTitle.textContent=data.title;panel.textContent=data.panel;report.textContent=data.report;checkpoints.textContent=data.checkpoints;conditionCopy.textContent=data.copy})});
const menuButton=document.querySelector("[data-menu-button]");
const nav=document.querySelector("[data-nav]");
menuButton.addEventListener("click",()=>{const open=menuButton.getAttribute("aria-expanded")==="true";menuButton.setAttribute("aria-expanded",String(!open));nav.classList.toggle("open",!open)});
nav.querySelectorAll("a").forEach(link=>{link.addEventListener("click",()=>{menuButton.setAttribute("aria-expanded","false");nav.classList.remove("open")})});
const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reveals=document.querySelectorAll(".reveal");
if(reducedMotion||!("IntersectionObserver" in window)){reveals.forEach(element=>element.classList.add("visible"))}else{const revealObserver=new IntersectionObserver((entries,observer)=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");observer.unobserve(entry.target)}})},{threshold:.09,rootMargin:"0px 0px -30px"});reveals.forEach(element=>revealObserver.observe(element))}
const sections=[...document.querySelectorAll("section[id]")];
const navLinks=[...nav.querySelectorAll("a[href^='#']")];
if("IntersectionObserver" in window){const sectionObserver=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(!entry.isIntersecting)return;navLinks.forEach(link=>{link.classList.toggle("active",link.getAttribute("href")===`#${entry.target.id}`)})})},{rootMargin:"-35% 0px -55%",threshold:0});sections.forEach(section=>sectionObserver.observe(section))}
