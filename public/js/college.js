for (let i = 1; i < 5; i++) {
    let button = document.querySelector(`label[for="option${i}"]`);
    button.addEventListener("click", () => {
        
        for (let j = 1; j < 5; j++) {
            document.querySelector(`label[for="option${j}"]`).style.backgroundColor = "white";
        }

        button.style.backgroundColor = "#E67514";
    });
}