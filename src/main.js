const greetButton = document.querySelector('#greetButton');
const message = document.querySelector('#message');

if (greetButton && message) {
  greetButton.addEventListener('click', () => {
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    message.textContent = `Hello from your app! The time is ${time}.`;
  });
}
