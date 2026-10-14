// Load the shared template definitions before enabling the template interface.
const templatesReady=import('/desk-templates.mjs').then(module=>{globalThis.DeskTemplates=module.DeskTemplates});
const groupTemplatesReady=templatesReady.then(()=>import('/group-templates.mjs'));
