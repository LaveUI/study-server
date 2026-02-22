function toggleTheme() {
  document.body.classList.toggle("light");
  sessionStorage.setItem(
    "theme",
    document.body.classList.contains("light") ? "light" : "dark"
  );
}

const savedTheme = sessionStorage.getItem("theme");
if (savedTheme === "light") {
  document.body.classList.add("light");
}
