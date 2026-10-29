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

const quizzes=[...document.querySelectorAll("[data-quiz]")];
const completedQuizzes=new Set();
const progressLabel=document.querySelector("[data-progress-label]");
const progressBar=document.querySelector("[data-progress-bar]");
const completionPanel=document.querySelector("[data-completion]");

const updateQuizProgress=()=>{
  if(!quizzes.length)return;
  const count=completedQuizzes.size;
  if(progressLabel)progressLabel.textContent=`${count} / ${quizzes.length} checks complete`;
  if(progressBar)progressBar.style.width=`${count/quizzes.length*100}%`;
  completionPanel?.classList.toggle("complete",count===quizzes.length);
};

quizzes.forEach((quiz,index)=>{
  quiz.addEventListener("submit",event=>{
    event.preventDefault();
    const feedback=quiz.querySelector("[data-feedback]");
    const selected=quiz.querySelector("input:checked");
    if(!selected){
      if(feedback){feedback.textContent="Choose an answer first.";feedback.className="quiz-feedback incorrect";}
      return;
    }
    const correct=selected.value===quiz.dataset.answer;
    if(feedback){
      feedback.textContent=correct?quiz.dataset.correct:quiz.dataset.incorrect;
      feedback.className=`quiz-feedback ${correct?"correct":"incorrect"}`;
    }
    quiz.classList.toggle("completed",correct);
    if(correct)completedQuizzes.add(index);else completedQuizzes.delete(index);
    updateQuizProgress();
  });
});

updateQuizProgress();
