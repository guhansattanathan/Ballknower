console.log("home.js loaded");

const gameNav = document.querySelector('.games');
const gameButton = document.querySelector('.game-btn');

gameButton.addEventListener("click", () => {
    gameNav.scrollIntoView({behavior: "smooth"});
})

const inspirationNav = document.querySelector('.inspiration');
const inspirationButton = document.querySelector('.inspiration-btn');

inspirationButton.addEventListener("click", () => {
    inspirationNav.scrollIntoView({behavior: "smooth"});
})

const gameOneHover = document.querySelector('.college-check');

gameOneHover.addEventListener("mouseover", () => {
    gameOneHover.style.transform = 'scale(1.1)';
    gameOneHover.style.transition = 'transform 0.2s ease-in-out';
})

gameOneHover.addEventListener("mouseout", () => {
     gameOneHover.style.transform = 'scale(1)';
})

const gameTwoHover = document.querySelector('.jersey-check');

gameTwoHover.addEventListener("mouseover", () => {
    gameTwoHover.style.transform = 'scale(1.1)';
    gameTwoHover.style.transition = 'transform 0.2s ease-in-out';
})

gameTwoHover.addEventListener("mouseout", () => {
     gameTwoHover.style.transform = 'scale(1)';
})


