// Función retirada: se mantiene una respuesta segura de compatibilidad.
// Utilizar cimat-indice-inteligente como servicio canónico.
Deno.serve((_request: Request) => new Response(
 JSON.stringify({mensaje:"Endpoint retirado. Utiliza cimat-indice-inteligente."}),
 {status:410,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"https://iscrod.github.io"}}));
