// Native modal focus/inert behavior with the game's shared popup presentation.
// Cancellation always resolves null; callers own persistence and error handling.
export const showMenuDialog = ({
  title,
  message,
  value,
  confirmLabel,
  destructive = false,
  choices,
}) => {
  if (document.querySelector('.menu-dialog')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'menu-dialog';
    dialog.setAttribute('aria-labelledby', 'menu-dialog-title');
    const form = document.createElement('form');
    const heading = document.createElement('h2');
    heading.id = 'menu-dialog-title';
    heading.textContent = title;
    form.append(heading);
    if (message) {
      const description = document.createElement('p');
      description.id = 'menu-dialog-description';
      description.textContent = message;
      dialog.setAttribute('aria-describedby', description.id);
      form.append(description);
    }
    let input;
    if (value !== undefined) {
      const label = document.createElement('label');
      label.textContent = 'Deck name';
      input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.required = true;
      input.autocomplete = 'off';
      label.append(input);
      form.append(label);
    }
    const actions = document.createElement('div');
    actions.className = 'menu-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.textContent = confirmLabel;
    confirm.className = destructive ? 'danger' : 'primary';
    actions.append(cancel);
    if (choices) {
      actions.classList.add('menu-dialog-choices');
      choices.forEach((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = choice.label;
        if (choice.destructive) button.className = 'danger';
        button.onclick = () => {
          result = choice.value;
          dialog.close();
        };
        actions.append(button);
      });
    } else {
      actions.append(confirm);
    }
    form.append(actions);
    dialog.append(form);
    document.body.append(dialog);
    let result = null;
    cancel.onclick = () => dialog.close();
    if (input) {
      input.oninput = () => {
        confirm.disabled = !input.value.trim();
      };
      input.oninput();
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      if (choices) return;
      if (input && !input.value.trim()) return;
      result = input ? input.value.trim() : true;
      dialog.close();
    };
    dialog.onclose = () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(result);
    };
    dialog.showModal();
    if (input) {
      input.focus();
      input.select();
    } else {
      cancel.focus();
    }
  });
};
