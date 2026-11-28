/* ============================================================================
   MOTOR DE MODELOS DE TRANSPORTE (100% DINÁMICO, SIN DATOS FIJOS EN CÁLCULO)
   Soporta: Minimización, Maximización, Rutas Prohibidas (Big-M), Desbalanceo,
   Degeneración con Árbol Generador (Union-Find), MODI, Óptimos Alternativos
   y Verificación de Invariantes.
   ============================================================================ */

const EPS = 1e-9;

const NOMBRE_ESTUDIANTE = "Brenda Margarita Ruiz González";
const GRUPO_ESTUDIANTE = "DI12C";
const CLAVE_LOCAL_STORAGE = "transporte_app_estado_v1";

const estadoAplicacion = {
  indicePasoActual: 0,
  verTodosLosPasos: false,
  varianteDiccionario: 0,
  ultimoModeloRender: null,
  ultimosPasosRender: [],
  ultimoResumenContexto: null,
  ultimaConfiguracion: {
    objetivo: "minimizar",
    filas: 3,
    columnas: 3,
    nombresOrigenes: ["Origen 1", "Origen 2", "Origen 3"],
    nombresDestinos: ["Destino 1", "Destino 2", "Destino 3"],
    costos: [],
    prohibidas: [],
    ofertas: [],
    demandas: []
  }
};

/* ---------- 1. UTILIDADES NUMÉRICAS, DE CLONACIÓN Y REGISTRO ---------- */

function esCero(valor) {
  return Math.abs(valor) < EPS;
}

function redondearSiCero(valor) {
  if (Math.abs(valor) < EPS) return 0;
  return Number(valor.toFixed(10));
}

function formatearNumero(valor) {
  if (!Number.isFinite(valor)) return "0";
  const limpio = redondearSiCero(valor);
  return Number.isInteger(limpio) ? String(limpio) : String(Number(limpio.toFixed(4)));
}

function clonarMatriz(matriz) {
  return matriz.map((fila) => [...fila]);
}

function clonarModelo(modelo) {
  return {
    objetivo: modelo.objetivo || "minimizar",
    nombresOrigenes: [...modelo.nombresOrigenes],
    nombresDestinos: [...modelo.nombresDestinos],
    costos: clonarMatriz(modelo.costos),
    prohibidas: modelo.prohibidas
      ? clonarMatriz(modelo.prohibidas)
      : modelo.costos.map((fila) => fila.map(() => false)),
    ofertas: [...modelo.ofertas],
    demandas: [...modelo.demandas],
    costosOpt: modelo.costosOpt ? clonarMatriz(modelo.costosOpt) : null,
    bigM: modelo.bigM || 1e6,
    maxValorReal: modelo.maxValorReal ?? 0
  };
}

function calcularValorRealTotal(asignacion, costos, prohibidas = null) {
  let total = 0;
  for (let i = 0; i < asignacion.length; i++) {
    for (let j = 0; j < asignacion[i].length; j++) {
      if (prohibidas && prohibidas[i][j]) continue;
      total += asignacion[i][j] * costos[i][j];
    }
  }
  return redondearSiCero(total);
}

function contarCeldasBasicas(basicas) {
  let contador = 0;
  for (let i = 0; i < basicas.length; i++) {
    for (let j = 0; j < basicas[i].length; j++) {
      if (basicas[i][j]) contador++;
    }
  }
  return contador;
}

function registrarPaso(pasos, { fase, titulo, explicacion, formula, asignacion, costos, prohibidas }) {
  if (!pasos) return;
  pasos.push({
    numero: pasos.length + 1,
    fase,
    titulo,
    explicacion,
    formula: formula || "",
    asignacion: asignacion ? clonarMatriz(asignacion) : null,
    costoAcumulado: asignacion && costos ? calcularValorRealTotal(asignacion, costos, prohibidas) : null
  });
}

/* ---------- 2. CONSTRUCCIÓN DE TABLA DE ENTRADA Y LECTURA DE DOM ---------- */

function obtenerObjetivoSeleccionado() {
  const marcado = document.querySelector('input[name="objetivoModelo"]:checked');
  return marcado ? marcado.value : "minimizar";
}

function obtenerModoSeleccionado() {
  const marcado = document.querySelector('input[name="modoResolucion"]:checked');
  return marcado ? marcado.value : "guiado";
}

function obtenerMetodoSeleccionado() {
  const marcado = document.querySelector('input[name="metodoResolucion"]:checked');
  return marcado ? marcado.value : "optimo";
}

function debeMostrarComparativa() {
  const check = document.getElementById("checkComparativa");
  return check ? check.checked : false;
}

function escaparAtributo(texto) {
  return String(texto).replace(/"/g, "&quot;");
}

function escaparTexto(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function capturarValoresActualesTabla() {
  const tabla = document.getElementById("tablaEntradaDatos");
  if (!tabla) return null;

  const nombresOrigenes = [];
  const nombresDestinos = [];
  const costos = [];
  const prohibidas = [];
  const ofertas = [];
  const demandas = [];

  let i = 0;
  while (document.getElementById(`nombreOrigen_${i}`)) {
    nombresOrigenes.push(document.getElementById(`nombreOrigen_${i}`).value);
    ofertas.push(document.getElementById(`oferta_${i}`)?.value ?? "");
    const filaC = [];
    const filaP = [];
    let j = 0;
    while (document.getElementById(`costo_${i}_${j}`)) {
      const raw = document.getElementById(`costo_${i}_${j}`).value;
      const parsed = parsearCeldaMatriz(raw);
      filaP.push(parsed.tipo === "prohibida");
      filaC.push(parsed.tipo === "prohibida" ? 0 : raw);
      j++;
    }
    costos.push(filaC);
    prohibidas.push(filaP);
    i++;
  }

  let j = 0;
  while (document.getElementById(`nombreDestino_${j}`)) {
    nombresDestinos.push(document.getElementById(`nombreDestino_${j}`).value);
    demandas.push(document.getElementById(`demanda_${j}`)?.value ?? "");
    j++;
  }

  return { nombresOrigenes, nombresDestinos, costos, prohibidas, ofertas, demandas };
}

function actualizarResumenBalancePrevio() {
  const caja = document.getElementById("estadoBalancePrevio");
  if (!caja) return;

  let sumaO = 0;
  let sumaD = 0;
  let i = 0;
  while (document.getElementById(`oferta_${i}`)) {
    const val = Number(document.getElementById(`oferta_${i}`).value);
    if (Number.isFinite(val) && val > 0) sumaO += val;
    i++;
  }
  let j = 0;
  while (document.getElementById(`demanda_${j}`)) {
    const val = Number(document.getElementById(`demanda_${j}`).value);
    if (Number.isFinite(val) && val > 0) sumaD += val;
    j++;
  }

  sumaO = redondearSiCero(sumaO);
  sumaD = redondearSiCero(sumaD);
  const dif = redondearSiCero(Math.abs(sumaO - sumaD));

  if (esCero(sumaO) && esCero(sumaD)) {
    caja.textContent = "Ingresa las ofertas y demandas para verificar el balance del sistema en tiempo real.";
  } else if (esCero(dif)) {
    caja.textContent = `Balance previo: Oferta total = ${formatearNumero(sumaO)} | Demanda total = ${formatearNumero(sumaD)}. El modelo está balanceado.`;
  } else if (sumaO > sumaD) {
    caja.textContent = `Balance previo: Oferta (${formatearNumero(sumaO)}) > Demanda (${formatearNumero(sumaD)}). Al resolver se agregará un Destino Ficticio de ${formatearNumero(dif)}.`;
  } else {
    caja.textContent = `Balance previo: Demanda (${formatearNumero(sumaD)}) > Oferta (${formatearNumero(sumaO)}). Al resolver se agregará un Origen Ficticio de ${formatearNumero(dif)}.`;
  }
}

function generarTablaEntrada(datosPrecargados = null) {
  const inputFilas = document.getElementById("cantidadOrigenes");
  const inputColumnas = document.getElementById("cantidadDestinos");
  const respaldo = datosPrecargados ? null : capturarValoresActualesTabla();
  const fuente = datosPrecargados || respaldo;

  const filas = datosPrecargados
    ? datosPrecargados.ofertas.length
    : Math.max(1, Math.min(10, parseInt(inputFilas.value, 10) || 3));
  const columnas = datosPrecargados
    ? datosPrecargados.demandas.length
    : Math.max(1, Math.min(10, parseInt(inputColumnas.value, 10) || 3));

  inputFilas.value = filas;
  inputColumnas.value = columnas;

  if (datosPrecargados?.objetivo) {
    const radioObj = document.querySelector(
      `input[name="objetivoModelo"][value="${datosPrecargados.objetivo}"]`
    );
    if (radioObj) radioObj.checked = true;
  }

  const contenedor = document.getElementById("contenedorTablaEntrada");
  let html = '<table class="tabla-transporte" id="tablaEntradaDatos"><thead><tr>';
  html += "<th>Origen \\ Destino</th>";

  for (let j = 0; j < columnas; j++) {
    const nombreDestino = fuente?.nombresDestinos?.[j] || `Destino ${j + 1}`;
    html += `<th>
      <input type="text" class="input-nombre" id="nombreDestino_${j}" value="${escaparAtributo(nombreDestino)}" aria-label="Nombre del destino ${j + 1}" />
    </th>`;
  }

  html += "<th>Oferta</th></tr></thead><tbody>";

  for (let i = 0; i < filas; i++) {
    const nombreOrigen = fuente?.nombresOrigenes?.[i] || `Origen ${i + 1}`;
    const ofertaValor = fuente?.ofertas?.[i] ?? "";

    html += `<tr>`;
    html += `<td>
      <input type="text" class="input-nombre" id="nombreOrigen_${i}" value="${escaparAtributo(nombreOrigen)}" aria-label="Nombre del origen ${i + 1}" />
    </td>`;

    for (let j = 0; j < columnas; j++) {
      const esProhibida = fuente?.prohibidas?.[i]?.[j] ?? false;
      const costoValor = esProhibida ? "M" : (fuente?.costos?.[i]?.[j] ?? "");
      html += `<td>
        <input type="text" class="input-numero" id="costo_${i}_${j}" value="${escaparAtributo(costoValor)}" placeholder="0" aria-label="Valor unitario de ${escaparAtributo(nombreOrigen)} a ${escaparAtributo(fuente?.nombresDestinos?.[j] ?? `Destino ${j + 1}`)}" />
      </td>`;
    }

    html += `<td>
      <input type="number" step="any" min="0" class="input-numero" id="oferta_${i}" value="${ofertaValor}" placeholder="0" aria-label="Oferta de ${escaparAtributo(nombreOrigen)}" />
    </td>`;
    html += `</tr>`;
  }

  html += `<tr><th>Demanda</th>`;
  for (let j = 0; j < columnas; j++) {
    const demandaValor = fuente?.demandas?.[j] ?? "";
    html += `<td>
      <input type="number" step="any" min="0" class="input-numero" id="demanda_${j}" value="${demandaValor}" placeholder="0" aria-label="Demanda del destino ${j + 1}" />
    </td>`;
  }
  html += `<th>Total</th></tr></tbody></table>`;

  contenedor.innerHTML = html;
  ocultarError();
  actualizarResumenBalancePrevio();
}

function parsearCeldaMatriz(raw) {
  const texto = String(raw ?? "").trim();
  if (texto === "") {
    return { tipo: "vacio", valor: 0 };
  }
  if (/^(m|x|inf|∞|-|prohibida|bloqueada)$/i.test(texto)) {
    return { tipo: "prohibida", valor: 0 };
  }
  const normalizado = texto.replace(",", ".");
  const num = Number(normalizado);
  if (Number.isFinite(num) && num >= 0) {
    return { tipo: "numero", valor: num };
  }
  return { tipo: "invalido", raw: texto };
}

function leerModeloDesdeFormulario() {
  const filas = parseInt(document.getElementById("cantidadOrigenes").value, 10);
  const columnas = parseInt(document.getElementById("cantidadDestinos").value, 10);
  const objetivo = obtenerObjetivoSeleccionado();

  const nombresOrigenes = [];
  const nombresDestinos = [];
  const costos = [];
  const prohibidas = [];
  const ofertas = [];
  const demandas = [];
  const erroresLectura = [];

  for (let i = 0; i < filas; i++) {
    const rawNombreO = document.getElementById(`nombreOrigen_${i}`)?.value.trim();
    const nombreOrigen = rawNombreO || `Origen ${i + 1}`;
    nombresOrigenes.push(nombreOrigen);

    const rawOferta = document.getElementById(`oferta_${i}`)?.value.trim() ?? "";
    if (rawOferta === "") {
      erroresLectura.push(`La oferta de "${nombreOrigen}" está vacía; ingresa un número mayor o igual a 0.`);
      ofertas.push(NaN);
    } else {
      ofertas.push(Number(rawOferta));
    }

    const filaCostos = [];
    const filaProhibidas = [];
    for (let j = 0; j < columnas; j++) {
      const rawCelda = document.getElementById(`costo_${i}_${j}`)?.value ?? "";
      const parsed = parsearCeldaMatriz(rawCelda);
      if (parsed.tipo === "invalido") {
        erroresLectura.push(
          `Valor inválido "${parsed.raw}" en (${nombreOrigen} -> Destino ${j + 1}). Usa un número >= 0 o "M" / "X" para ruta prohibida.`
        );
        filaCostos.push(NaN);
        filaProhibidas.push(false);
      } else if (parsed.tipo === "prohibida") {
        filaCostos.push(0);
        filaProhibidas.push(true);
      } else {
        filaCostos.push(parsed.valor);
        filaProhibidas.push(false);
      }
    }
    costos.push(filaCostos);
    prohibidas.push(filaProhibidas);
  }

  for (let j = 0; j < columnas; j++) {
    const rawNombreD = document.getElementById(`nombreDestino_${j}`)?.value.trim();
    const nombreDestino = rawNombreD || `Destino ${j + 1}`;
    nombresDestinos.push(nombreDestino);

    const rawDemanda = document.getElementById(`demanda_${j}`)?.value.trim() ?? "";
    if (rawDemanda === "") {
      erroresLectura.push(`La demanda de "${nombreDestino}" está vacía; ingresa un número mayor o igual a 0.`);
      demandas.push(NaN);
    } else {
      demandas.push(Number(rawDemanda));
    }
  }

  return {
    objetivo,
    nombresOrigenes,
    nombresDestinos,
    costos,
    prohibidas,
    ofertas,
    demandas,
    erroresLectura
  };
}

function validarModelo(modelo) {
  const errores = [...(modelo.erroresLectura || [])];

  if (modelo.ofertas.length === 0 || modelo.demandas.length === 0) {
    errores.push("Debe existir al menos un origen y un destino.");
  }

  modelo.ofertas.forEach((val, i) => {
    if (!Number.isFinite(val) || val < 0) {
      if (!errores.some((e) => e.includes(`"${modelo.nombresOrigenes[i]}"`))) {
        errores.push(`La oferta de "${modelo.nombresOrigenes[i]}" debe ser un número mayor o igual a 0.`);
      }
    }
  });

  modelo.demandas.forEach((val, j) => {
    if (!Number.isFinite(val) || val < 0) {
      if (!errores.some((e) => e.includes(`"${modelo.nombresDestinos[j]}"`))) {
        errores.push(`La demanda de "${modelo.nombresDestinos[j]}" debe ser un número mayor o igual a 0.`);
      }
    }
  });

  for (let i = 0; i < modelo.costos.length; i++) {
    for (let j = 0; j < modelo.costos[i].length; j++) {
      if (modelo.prohibidas?.[i]?.[j]) continue;
      const costo = modelo.costos[i][j];
      if (!Number.isFinite(costo) || costo < 0) {
        errores.push(
          `El valor en (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]}) debe ser un número mayor o igual a 0.`
        );
      }
    }
  }

  if (errores.length === 0) {
    const sumaOferta = modelo.ofertas.reduce((acc, n) => acc + n, 0);
    const sumaDemanda = modelo.demandas.reduce((acc, n) => acc + n, 0);
    if (sumaOferta <= EPS && sumaDemanda <= EPS) {
      errores.push("La oferta total y la demanda total no pueden ser ambas cero.");
    }
  }

  return errores;
}

/* ---------- 3. BALANCEO Y PREPARACIÓN DE MATRIZ DE OPTIMIZACIÓN ---------- */

function prepararMatrizOptimizacion(modelo) {
  let maxVal = 0;
  for (let i = 0; i < modelo.costos.length; i++) {
    for (let j = 0; j < modelo.costos[i].length; j++) {
      if (!modelo.prohibidas[i][j] && modelo.costos[i][j] > maxVal) {
        maxVal = modelo.costos[i][j];
      }
    }
  }

  const bigM = Math.max(1e6, (maxVal + 1) * 10000);
  const costosOpt = [];

  for (let i = 0; i < modelo.costos.length; i++) {
    const fila = [];
    for (let j = 0; j < modelo.costos[i].length; j++) {
      if (modelo.prohibidas[i][j]) {
        fila.push(bigM);
      } else if (modelo.objetivo === "maximizar") {
        fila.push(redondearSiCero(maxVal - modelo.costos[i][j]));
      } else {
        fila.push(modelo.costos[i][j]);
      }
    }
    costosOpt.push(fila);
  }

  modelo.costosOpt = costosOpt;
  modelo.bigM = bigM;
  modelo.maxValorReal = maxVal;
}

function balancearModelo(modeloOriginal, pasos = null) {
  const modelo = clonarModelo(modeloOriginal);
  const sumaOferta = redondearSiCero(modelo.ofertas.reduce((acc, v) => acc + v, 0));
  const sumaDemanda = redondearSiCero(modelo.demandas.reduce((acc, v) => acc + v, 0));
  const diferencia = redondearSiCero(Math.abs(sumaOferta - sumaDemanda));

  let balanceadoOriginalmente = true;

  if (esCero(diferencia)) {
    registrarPaso(pasos, {
      fase: "Balanceo",
      titulo: "Modelo balanceado",
      explicacion: `La oferta total (${formatearNumero(sumaOferta)}) es igual a la demanda total (${formatearNumero(sumaDemanda)}). No se requieren nodos ficticios.`,
      formula: `Σ Oferta = ${formatearNumero(sumaOferta)}  |  Σ Demanda = ${formatearNumero(sumaDemanda)}`
    });
  } else if (sumaOferta > sumaDemanda) {
    balanceadoOriginalmente = false;
    modelo.nombresDestinos.push("Destino Ficticio");
    modelo.demandas.push(diferencia);
    for (let i = 0; i < modelo.costos.length; i++) {
      modelo.costos[i].push(0);
      modelo.prohibidas[i].push(false);
    }

    registrarPaso(pasos, {
      fase: "Balanceo",
      titulo: "Se agrega Destino Ficticio para balancear",
      explicacion: `La oferta (${formatearNumero(sumaOferta)}) supera a la demanda (${formatearNumero(sumaDemanda)}) por ${formatearNumero(diferencia)} unidades. Se añade "Destino Ficticio" con demanda ${formatearNumero(diferencia)} y valor unitario 0.`,
      formula: `Demanda Ficticia = ${formatearNumero(sumaOferta)} - ${formatearNumero(sumaDemanda)} = ${formatearNumero(diferencia)}`
    });
  } else {
    balanceadoOriginalmente = false;
    modelo.nombresOrigenes.push("Origen Ficticio");
    modelo.ofertas.push(diferencia);
    const nCols = modelo.nombresDestinos.length;
    modelo.costos.push(new Array(nCols).fill(0));
    modelo.prohibidas.push(new Array(nCols).fill(false));

    registrarPaso(pasos, {
      fase: "Balanceo",
      titulo: "Se agrega Origen Ficticio para balancear",
      explicacion: `La demanda (${formatearNumero(sumaDemanda)}) supera a la oferta (${formatearNumero(sumaOferta)}) por ${formatearNumero(diferencia)} unidades. Se añade "Origen Ficticio" con oferta ${formatearNumero(diferencia)} y valor unitario 0.`,
      formula: `Oferta Ficticia = ${formatearNumero(sumaDemanda)} - ${formatearNumero(sumaOferta)} = ${formatearNumero(diferencia)}`
    });
  }

  prepararMatrizOptimizacion(modelo);

  if (modelo.objetivo === "maximizar") {
    registrarPaso(pasos, {
      fase: "Conversión de Objetivo",
      titulo: "Transformación de Maximización a Minimización equivalente",
      explicacion: `Se toma la utilidad máxima disponible (V_max = ${formatearNumero(modelo.maxValorReal)}) y se calcula el costo de oportunidad c'_ij = V_max - u_ij para cada ruta permitida (las rutas ficticias con utilidad 0 quedan con c'_ij = ${formatearNumero(modelo.maxValorReal)}).`,
      formula: `c'_ij = ${formatearNumero(modelo.maxValorReal)} - u_ij`
    });
  }

  return { modelo, balanceadoOriginalmente, diferencia };
}

/* ---------- 4. SOLUCIONES INICIALES Y REPARACIÓN ACÍCLICA (ÁRBOL GENERADOR) ---------- */

function inicializarMatricesTrabajo(m, n) {
  return {
    asignacion: Array.from({ length: m }, () => new Array(n).fill(0)),
    basicas: Array.from({ length: m }, () => new Array(n).fill(false))
  };
}

function crearUnionFind(tamano) {
  const padre = Array.from({ length: tamano }, (_, idx) => idx);
  function find(x) {
    while (padre[x] !== x) {
      padre[x] = padre[padre[x]];
      x = padre[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    padre[rb] = ra;
    return true;
  }
  return { find, union };
}

function repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos = null) {
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;
  const requeridas = m + n - 1;
  let actuales = contarCeldasBasicas(basicas);

  if (actuales >= requeridas) return;

  // Construimos Union-Find sobre nodos bipartitos: filas [0..m-1], columnas [m..m+n-1]
  // para garantizar que las celdas básicas formen un árbol generador sin ciclos.
  const uf = crearUnionFind(m + n);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (basicas[i][j]) {
        uf.union(i, m + j);
      }
    }
  }

  const candidatas = [];
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (!basicas[i][j]) {
        candidatas.push({
          i,
          j,
          prohibida: Boolean(modelo.prohibidas[i][j]),
          costoOpt: modelo.costosOpt[i][j]
        });
      }
    }
  }

  candidatas.sort((a, b) => {
    if (a.prohibida !== b.prohibida) return a.prohibida ? 1 : -1;
    if (Math.abs(a.costoOpt - b.costoOpt) > EPS) return a.costoOpt - b.costoOpt;
    if (a.i !== b.i) return a.i - b.i;
    return a.j - b.j;
  });

  for (const cand of candidatas) {
    if (actuales >= requeridas) break;
    if (uf.union(cand.i, m + cand.j)) {
      basicas[cand.i][cand.j] = true;
      actuales++;

      registrarPaso(pasos, {
        fase: "Ajuste de Degeneración",
        titulo: `Celda básica auxiliar (ε) en (${modelo.nombresOrigenes[cand.i]} -> ${modelo.nombresDestinos[cand.j]})`,
        explicacion: `El número de celdas básicas es menor que m + n - 1 = ${requeridas}. Para evitar degeneración y permitir resolver uᵢ + vⱼ = cᵢⱼ en MODI, se asigna un valor conceptual ε (≈ 0) en una celda independiente sin formar ciclos.`,
        formula: `Básicas = ${actuales} de m + n - 1 = ${requeridas}  |  x = ε (≈ 0)`,
        asignacion,
        costos: modelo.costos,
        prohibidas: modelo.prohibidas
      });
    }
  }
}

function resolverEsquinaNoroeste(modelo, pasos = null) {
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;
  const ofertaRestante = [...modelo.ofertas];
  const demandaRestante = [...modelo.demandas];
  const { asignacion, basicas } = inicializarMatricesTrabajo(m, n);

  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    const ofertaAntes = ofertaRestante[i];
    const demandaAntes = demandaRestante[j];
    const cantidad = redondearSiCero(Math.min(ofertaAntes, demandaAntes));

    asignacion[i][j] = cantidad;
    basicas[i][j] = true;
    ofertaRestante[i] = redondearSiCero(ofertaAntes - cantidad);
    demandaRestante[j] = redondearSiCero(demandaAntes - cantidad);

    const origenNombre = modelo.nombresOrigenes[i];
    const destinoNombre = modelo.nombresDestinos[j];
    const etiquetaValor = modelo.prohibidas[i][j] ? "M (Prohibida)" : formatearNumero(modelo.costos[i][j]);

    let motivoAvance = "";
    if (esCero(ofertaRestante[i]) && esCero(demandaRestante[j])) {
      motivoAvance = "Se agotan simultáneamente la oferta de la fila y la demanda de la columna; se avanza en fila y columna.";
      i++;
      j++;
    } else if (esCero(ofertaRestante[i])) {
      motivoAvance = `Se agota la oferta de ${origenNombre}; se pasa al siguiente origen.`;
      i++;
    } else {
      motivoAvance = `Se agota la demanda de ${destinoNombre}; se pasa al siguiente destino.`;
      j++;
    }

    registrarPaso(pasos, {
      fase: "Esquina Noroeste",
      titulo: `Asignar ${formatearNumero(cantidad)} en (${origenNombre} -> ${destinoNombre})`,
      explicacion: `Se toma la celda activa más al noroeste (valor unitario: ${etiquetaValor}). ${motivoAvance}`,
      formula: `x = min(${formatearNumero(ofertaAntes)}, ${formatearNumero(demandaAntes)}) = ${formatearNumero(cantidad)}`,
      asignacion,
      costos: modelo.costos,
      prohibidas: modelo.prohibidas
    });
  }

  repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);
  return { asignacion, basicas };
}

function resolverCostoMenor(modelo, pasos = null) {
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;
  const ofertaRestante = [...modelo.ofertas];
  const demandaRestante = [...modelo.demandas];
  const { asignacion, basicas } = inicializarMatricesTrabajo(m, n);

  while (true) {
    let mejorCelda = null;

    for (let i = 0; i < m; i++) {
      if (ofertaRestante[i] <= EPS) continue;
      for (let j = 0; j < n; j++) {
        if (demandaRestante[j] <= EPS) continue;
        const costoOpt = modelo.costosOpt[i][j];
        const capacidad = Math.min(ofertaRestante[i], demandaRestante[j]);

        if (
          !mejorCelda ||
          costoOpt < mejorCelda.costoOpt - EPS ||
          (Math.abs(costoOpt - mejorCelda.costoOpt) <= EPS && capacidad > mejorCelda.capacidad + EPS)
        ) {
          mejorCelda = { i, j, costoOpt, capacidad };
        }
      }
    }

    if (!mejorCelda) break;

    const { i, j } = mejorCelda;
    const cantidad = redondearSiCero(Math.min(ofertaRestante[i], demandaRestante[j]));
    asignacion[i][j] = cantidad;
    basicas[i][j] = true;
    ofertaRestante[i] = redondearSiCero(ofertaRestante[i] - cantidad);
    demandaRestante[j] = redondearSiCero(demandaRestante[j] - cantidad);

    const etiquetaValor = modelo.prohibidas[i][j] ? "M (Prohibida)" : formatearNumero(modelo.costos[i][j]);

    registrarPaso(pasos, {
      fase: "Costo Menor",
      titulo: `Asignar ${formatearNumero(cantidad)} en (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]})`,
      explicacion: `Celda activa más favorable con valor real ${etiquetaValor}. En caso de empate se prioriza mayor cantidad asignable.`,
      formula: `Valor unitario = ${etiquetaValor}  |  x = ${formatearNumero(cantidad)}`,
      asignacion,
      costos: modelo.costos,
      prohibidas: modelo.prohibidas
    });
  }

  repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);
  return { asignacion, basicas };
}

function evaluarLineaVogel(valoresOrdenados) {
  if (valoresOrdenados.length === 0) return { penalizacion: -1, minCosto: Infinity };
  if (valoresOrdenados.length === 1) return { penalizacion: 0, minCosto: valoresOrdenados[0] };
  return {
    penalizacion: redondearSiCero(valoresOrdenados[1] - valoresOrdenados[0]),
    minCosto: valoresOrdenados[0]
  };
}

function resolverAproximacionVogel(modelo, pasos = null) {
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;
  const ofertaRestante = [...modelo.ofertas];
  const demandaRestante = [...modelo.demandas];
  const { asignacion, basicas } = inicializarMatricesTrabajo(m, n);

  while (true) {
    const filasActivas = [];
    const columnasActivas = [];
    for (let i = 0; i < m; i++) if (ofertaRestante[i] > EPS) filasActivas.push(i);
    for (let j = 0; j < n; j++) if (demandaRestante[j] > EPS) columnasActivas.push(j);

    if (filasActivas.length === 0 || columnasActivas.length === 0) break;

    // Si solo queda 1 fila o 1 columna activa, las asignaciones restantes son forzadas.
    if (filasActivas.length === 1 || columnasActivas.length === 1) {
      const paresRestantes = [];
      for (const i of filasActivas) {
        for (const j of columnasActivas) {
          paresRestantes.push({ i, j, costoOpt: modelo.costosOpt[i][j] });
        }
      }
      paresRestantes.sort((a, b) => a.costoOpt - b.costoOpt);

      for (const par of paresRestantes) {
        const cantidad = redondearSiCero(Math.min(ofertaRestante[par.i], demandaRestante[par.j]));
        if (cantidad <= EPS) continue;
        asignacion[par.i][par.j] = cantidad;
        basicas[par.i][par.j] = true;
        ofertaRestante[par.i] = redondearSiCero(ofertaRestante[par.i] - cantidad);
        demandaRestante[par.j] = redondearSiCero(demandaRestante[par.j] - cantidad);

        registrarPaso(pasos, {
          fase: "Aproximación de Vogel",
          titulo: `Asignación directa ${formatearNumero(cantidad)} en (${modelo.nombresOrigenes[par.i]} -> ${modelo.nombresDestinos[par.j]})`,
          explicacion: `Solo queda una línea activa; la asignación es obligatoria para cubrir el saldo restante.`,
          formula: `x = ${formatearNumero(cantidad)}`,
          asignacion,
          costos: modelo.costos,
          prohibidas: modelo.prohibidas
        });
      }
      break;
    }

    let mejorCandidato = null;
    const detallePenFilas = [];
    const detallePenCols = [];

    // Evaluar filas activas
    for (const i of filasActivas) {
      const celdasFila = columnasActivas
        .map((j) => ({
          i,
          j,
          costoOpt: modelo.costosOpt[i][j],
          capacidad: Math.min(ofertaRestante[i], demandaRestante[j])
        }))
        .sort((a, b) => {
          if (Math.abs(a.costoOpt - b.costoOpt) > EPS) return a.costoOpt - b.costoOpt;
          return b.capacidad - a.capacidad;
        });

      const evalF = evaluarLineaVogel(celdasFila.map((c) => c.costoOpt));
      detallePenFilas.push(`${modelo.nombresOrigenes[i]}: ${formatearNumero(evalF.penalizacion)}`);
      const celda = celdasFila[0];
      const candidato = {
        tipo: "fila",
        penalizacion: evalF.penalizacion,
        minCosto: evalF.minCosto,
        capacidad: celda.capacidad,
        i: celda.i,
        j: celda.j
      };

      if (esMejorCandidatoVogel(candidato, mejorCandidato)) {
        mejorCandidato = candidato;
      }
    }

    // Evaluar columnas activas
    for (const j of columnasActivas) {
      const celdasCol = filasActivas
        .map((i) => ({
          i,
          j,
          costoOpt: modelo.costosOpt[i][j],
          capacidad: Math.min(ofertaRestante[i], demandaRestante[j])
        }))
        .sort((a, b) => {
          if (Math.abs(a.costoOpt - b.costoOpt) > EPS) return a.costoOpt - b.costoOpt;
          return b.capacidad - a.capacidad;
        });

      const evalC = evaluarLineaVogel(celdasCol.map((c) => c.costoOpt));
      detallePenCols.push(`${modelo.nombresDestinos[j]}: ${formatearNumero(evalC.penalizacion)}`);
      const celda = celdasCol[0];
      const candidato = {
        tipo: "columna",
        penalizacion: evalC.penalizacion,
        minCosto: evalC.minCosto,
        capacidad: celda.capacidad,
        i: celda.i,
        j: celda.j
      };

      if (esMejorCandidatoVogel(candidato, mejorCandidato)) {
        mejorCandidato = candidato;
      }
    }

    const { i, j, penalizacion, tipo } = mejorCandidato;
    const cantidad = redondearSiCero(Math.min(ofertaRestante[i], demandaRestante[j]));
    asignacion[i][j] = cantidad;
    basicas[i][j] = true;
    ofertaRestante[i] = redondearSiCero(ofertaRestante[i] - cantidad);
    demandaRestante[j] = redondearSiCero(demandaRestante[j] - cantidad);

    const etiquetaLinea =
      tipo === "fila"
        ? `Fila "${modelo.nombresOrigenes[i]}"`
        : `Columna "${modelo.nombresDestinos[j]}"`;
    const etiquetaValor = modelo.prohibidas[i][j] ? "M (Prohibida)" : formatearNumero(modelo.costos[i][j]);

    registrarPaso(pasos, {
      fase: "Aproximación de Vogel",
      titulo: `Asignar ${formatearNumero(cantidad)} en (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]})`,
      explicacion: `Penalizaciones calculadas -> Filas [${detallePenFilas.join(", ")}] | Columnas [${detallePenCols.join(", ")}]. Gana ${etiquetaLinea} con penalización ${formatearNumero(penalizacion)} y se asigna a su celda más favorable (valor real: ${etiquetaValor}).`,
      formula: `Penalización máx. = ${formatearNumero(penalizacion)}  |  x = ${formatearNumero(cantidad)}`,
      asignacion,
      costos: modelo.costos,
      prohibidas: modelo.prohibidas
    });
  }

  repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);
  return { asignacion, basicas };
}

function esMejorCandidatoVogel(nuevo, actual) {
  if (!actual) return true;
  if (nuevo.penalizacion > actual.penalizacion + EPS) return true;
  if (Math.abs(nuevo.penalizacion - actual.penalizacion) <= EPS) {
    if (nuevo.minCosto < actual.minCosto - EPS) return true;
    if (Math.abs(nuevo.minCosto - actual.minCosto) <= EPS) {
      return nuevo.capacidad > actual.capacidad + EPS;
    }
  }
  return false;
}

/* ---------- 5. OPTIMIZACIÓN CON MÉTODO MODI ---------- */

function calcularMultiplicadoresMODI(costosOpt, basicas) {
  const m = costosOpt.length;
  const n = costosOpt[0].length;
  const u = new Array(m).fill(null);
  const v = new Array(n).fill(null);

  u[0] = 0;
  const cola = [{ tipo: "u", idx: 0 }];

  while (cola.length > 0) {
    const actual = cola.shift();
    if (actual.tipo === "u") {
      const i = actual.idx;
      for (let j = 0; j < n; j++) {
        if (basicas[i][j] && v[j] === null) {
          v[j] = costosOpt[i][j] - u[i];
          cola.push({ tipo: "v", idx: j });
        }
      }
    } else {
      const j = actual.idx;
      for (let i = 0; i < m; i++) {
        if (basicas[i][j] && u[i] === null) {
          u[i] = costosOpt[i][j] - v[j];
          cola.push({ tipo: "u", idx: i });
        }
      }
    }
  }

  return { u, v };
}

function encontrarCicloCerrado(basicas, inicioFila, inicioCol) {
  const m = basicas.length;
  const n = basicas[0].length;
  const camino = [{ i: inicioFila, j: inicioCol }];
  const visitados = new Set([`${inicioFila},${inicioCol}`]);

  function buscar(buscarHorizontal) {
    const actual = camino[camino.length - 1];

    if (buscarHorizontal) {
      for (let j = 0; j < n; j++) {
        if (j === actual.j) continue;
        if (camino.length >= 4 && actual.i === inicioFila && j === inicioCol) {
          return [...camino];
        }
        const clave = `${actual.i},${j}`;
        if (basicas[actual.i][j] && !visitados.has(clave)) {
          visitados.add(clave);
          camino.push({ i: actual.i, j });
          const res = buscar(false);
          if (res) return res;
          camino.pop();
        }
      }
    } else {
      for (let i = 0; i < m; i++) {
        if (i === actual.i) continue;
        if (camino.length >= 4 && i === inicioFila && actual.j === inicioCol) {
          return [...camino];
        }
        const clave = `${i},${actual.j}`;
        if (basicas[i][actual.j] && !visitados.has(clave)) {
          visitados.add(clave);
          camino.push({ i, j: actual.j });
          const res = buscar(true);
          if (res) return res;
          camino.pop();
        }
      }
    }
    return null;
  }

  return buscar(true);
}

function optimizarConMODI(modelo, estadoInicial, pasos = null) {
  const asignacion = clonarMatriz(estadoInicial.asignacion);
  const basicas = clonarMatriz(estadoInicial.basicas);
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;

  repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);

  const maxIteraciones = Math.max(50, m * n * 10);
  let iteracion = 0;
  let iteracionesRealizadas = 0;
  let optimosAlternativos = [];

  while (iteracion < maxIteraciones) {
    iteracion++;
    const { u, v } = calcularMultiplicadoresMODI(modelo.costosOpt, basicas);

    if (u.some((x) => x === null) || v.some((y) => y === null)) {
      registrarPaso(pasos, {
        fase: "Optimización MODI",
        titulo: "Base desconectada al calcular multiplicadores u/v",
        explicacion: "Se intenta reparar la conectividad de la base y continuar.",
        asignacion,
        costos: modelo.costos,
        prohibidas: modelo.prohibidas
      });
      repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);
      break;
    }

    let peorDelta = 0;
    let celdaEntrante = null;
    const celdasDeltaCero = [];

    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (basicas[i][j]) continue;
        const delta = modelo.costosOpt[i][j] - (u[i] + v[j]);
        if (delta < peorDelta - EPS) {
          peorDelta = delta;
          celdaEntrante = { i, j, delta };
        } else if (!modelo.prohibidas[i][j] && Math.abs(delta) <= EPS) {
          celdasDeltaCero.push({ i, j });
        }
      }
    }

    const textoMultiplicadores = `u = [${u.map((x) => formatearNumero(x)).join(", ")}]  |  v = [${v.map((y) => formatearNumero(y)).join(", ")}]`;

    if (!celdaEntrante) {
      optimosAlternativos = celdasDeltaCero;
      const textoAlt =
        optimosAlternativos.length > 0
          ? ` Además, se detectaron ${optimosAlternativos.length} ruta(s) no básica(s) con Δ = 0, lo que indica que existen soluciones óptimas alternativas con el mismo valor total.`
          : "";

      registrarPaso(pasos, {
        fase: "Optimización MODI",
        titulo: "Solución óptima alcanzada",
        explicacion: `Multiplicadores resueltos: ${textoMultiplicadores}. Para todas las celdas no básicas se cumple Δ_ij = c'_ij - (u_i + v_j) >= 0; ningún intercambio mejora la función objetivo.${textoAlt}`,
        formula: `∀ celdas no básicas: c'_ij - (u_i + v_j) >= 0  |  ${textoMultiplicadores}`,
        asignacion,
        costos: modelo.costos,
        prohibidas: modelo.prohibidas
      });
      break;
    }

    const ciclo = encontrarCicloCerrado(basicas, celdaEntrante.i, celdaEntrante.j);
    if (!ciclo || ciclo.length < 4) {
      registrarPaso(pasos, {
        fase: "Optimización MODI",
        titulo: "Ciclo no cerrado en iteración MODI",
        explicacion: "No se pudo cerrar el ciclo alternante para la celda entrante; se conserva la mejor solución obtenida.",
        asignacion,
        costos: modelo.costos,
        prohibidas: modelo.prohibidas
      });
      break;
    }

    // Índices pares: +, índices impares: -
    let theta = Infinity;
    let idxSaliente = -1;
    for (let idx = 1; idx < ciclo.length; idx += 2) {
      const punto = ciclo[idx];
      const valorActual = asignacion[punto.i][punto.j];
      if (valorActual < theta - EPS) {
        theta = valorActual;
        idxSaliente = idx;
      }
    }

    theta = redondearSiCero(theta);
    basicas[celdaEntrante.i][celdaEntrante.j] = true;

    for (let idx = 0; idx < ciclo.length; idx++) {
      const punto = ciclo[idx];
      if (idx % 2 === 0) {
        asignacion[punto.i][punto.j] = redondearSiCero(asignacion[punto.i][punto.j] + theta);
      } else {
        asignacion[punto.i][punto.j] = redondearSiCero(asignacion[punto.i][punto.j] - theta);
      }
    }

    if (idxSaliente !== -1) {
      const sal = ciclo[idxSaliente];
      asignacion[sal.i][sal.j] = 0;
      basicas[sal.i][sal.j] = false;
    }

    repararDegeneracionSiAplica(modelo, asignacion, basicas, pasos);
    iteracionesRealizadas++;

    const descripcionCiclo = ciclo
      .map((p, idx) => `${idx % 2 === 0 ? "+" : "-"}(${modelo.nombresOrigenes[p.i]}->${modelo.nombresDestinos[p.j]})`)
      .join(" ");

    registrarPaso(pasos, {
      fase: "Optimización MODI",
      titulo: `Iteración ${iteracionesRealizadas}: mejora en (${modelo.nombresOrigenes[celdaEntrante.i]} -> ${modelo.nombresDestinos[celdaEntrante.j]})`,
      explicacion: `Con ${textoMultiplicadores}, el indicador más negativo es Δ = ${formatearNumero(celdaEntrante.delta)} < 0. Se reasignan θ = ${formatearNumero(theta)} unidades en el ciclo cerrado: ${descripcionCiclo}.`,
      formula: `Δ = ${formatearNumero(celdaEntrante.delta)}  |  θ = ${formatearNumero(theta)}  |  ${textoMultiplicadores}`,
      asignacion,
      costos: modelo.costos,
      prohibidas: modelo.prohibidas
    });
  }

  return {
    asignacion,
    basicas,
    iteracionesMODI: iteracionesRealizadas,
    optimosAlternativos
  };
}

/* ---------- 6. VERIFICACIÓN DE INVARIANTES Y COMPARATIVA ---------- */

function verificarInvariantes(modelo, asignacion, basicas, verificarArbol = true) {
  const m = modelo.ofertas.length;
  const n = modelo.demandas.length;
  const incidencias = [];
  let infactiblePorProhibidas = false;

  for (let i = 0; i < m; i++) {
    let sumaFila = 0;
    for (let j = 0; j < n; j++) {
      if (asignacion[i][j] < -EPS) {
        incidencias.push(`Asignación negativa en (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]}).`);
      }
      if (modelo.prohibidas[i][j] && asignacion[i][j] > EPS) {
        infactiblePorProhibidas = true;
      }
      sumaFila += asignacion[i][j];
    }
    if (Math.abs(sumaFila - modelo.ofertas[i]) > 1e-6) {
      incidencias.push(`La suma asignada en "${modelo.nombresOrigenes[i]}" (${formatearNumero(sumaFila)}) no coincide con su oferta (${formatearNumero(modelo.ofertas[i])}).`);
    }
  }

  for (let j = 0; j < n; j++) {
    let sumaCol = 0;
    for (let i = 0; i < m; i++) {
      sumaCol += asignacion[i][j];
    }
    if (Math.abs(sumaCol - modelo.demandas[j]) > 1e-6) {
      incidencias.push(`La suma asignada en "${modelo.nombresDestinos[j]}" (${formatearNumero(sumaCol)}) no coincide con su demanda (${formatearNumero(modelo.demandas[j])}).`);
    }
  }

  if (verificarArbol && contarCeldasBasicas(basicas) !== m + n - 1) {
    incidencias.push(`Conteo de básicas (${contarCeldasBasicas(basicas)}) distinto de m + n - 1 (${m + n - 1}).`);
  }

  return {
    esValida: incidencias.length === 0 && !infactiblePorProhibidas,
    infactiblePorProhibidas,
    incidencias
  };
}

function ejecutarEstrategia(modeloBalanceado, metodo, pasos = null) {
  let estado;
  if (metodo === "noroeste") {
    estado = resolverEsquinaNoroeste(modeloBalanceado, pasos);
  } else if (metodo === "costoMenor") {
    estado = resolverCostoMenor(modeloBalanceado, pasos);
  } else if (metodo === "vogel") {
    estado = resolverAproximacionVogel(modeloBalanceado, pasos);
  } else if (metodo === "noroesteModi") {
    estado = resolverEsquinaNoroeste(modeloBalanceado, pasos);
    estado = optimizarConMODI(modeloBalanceado, estado, pasos);
  } else if (metodo === "costoMenorModi") {
    estado = resolverCostoMenor(modeloBalanceado, pasos);
    estado = optimizarConMODI(modeloBalanceado, estado, pasos);
  } else {
    estado = resolverAproximacionVogel(modeloBalanceado, pasos);
    estado = optimizarConMODI(modeloBalanceado, estado, pasos);
  }
  return estado;
}

function generarComparativaMetodos(modeloBalanceado) {
  const estrategias = [
    { id: "noroeste", nombre: "Esquina Noroeste (Inicial)" },
    { id: "costoMenor", nombre: "Costo Menor (Inicial)" },
    { id: "vogel", nombre: "Aproximación de Vogel (Inicial)" },
    { id: "noroesteModi", nombre: "Esquina Noroeste + MODI" },
    { id: "costoMenorModi", nombre: "Costo Menor + MODI" },
    { id: "optimo", nombre: "Vogel + MODI (Óptimo)" }
  ];

  const resultados = estrategias.map((est) => {
    const sol = ejecutarEstrategia(modeloBalanceado, est.id, null);
    const inv = verificarInvariantes(modeloBalanceado, sol.asignacion, sol.basicas);
    const valorTotal = calcularValorRealTotal(sol.asignacion, modeloBalanceado.costos, modeloBalanceado.prohibidas);
    return {
      ...est,
      valorTotal,
      iteracionesMODI: sol.iteracionesMODI ?? 0,
      infactible: inv.infactiblePorProhibidas
    };
  });

  const factibles = resultados.filter((r) => !r.infactible);
  let mejorValor = null;
  if (factibles.length > 0) {
    mejorValor =
      modeloBalanceado.objetivo === "maximizar"
        ? Math.max(...factibles.map((r) => r.valorTotal))
        : Math.min(...factibles.map((r) => r.valorTotal));
  }

  return { resultados, mejorValor };
}

/* ---------- 7. FORMULACIÓN Y RENDERIZADO ---------- */

function construirFormulacion(modelo, metodo) {
  const terminosObjetivo = [];
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const coef = modelo.prohibidas[i][j] ? "M" : formatearNumero(modelo.costos[i][j]);
      terminosObjetivo.push(`${coef}·x_${i + 1}${j + 1}`);
    }
  }

  const sumaOferta = redondearSiCero(modelo.ofertas.reduce((acc, v) => acc + v, 0));
  const sumaDemanda = redondearSiCero(modelo.demandas.reduce((acc, v) => acc + v, 0));

  const descripcionesMetodo = {
    noroeste: "Esquina Noroeste: asigna desde (1,1) agotando oferta aᵢ o demanda bⱼ en cada paso.",
    costoMenor: "Costo Mínimo: selecciona en cada iteración la celda activa con menor costo unitario cᵢⱼ (o mayor utilidad).",
    vogel: "Aproximación de Vogel (VAM): prioriza la fila o columna con mayor penalización (diferencia entre los 2 menores costos).",
    noroesteModi: "Esquina Noroeste + MODI: parte de la esquina noroeste y optimiza con uᵢ + vⱼ = cᵢⱼ hasta Δᵢⱼ >= 0.",
    costoMenorModi: "Costo Mínimo + MODI: parte del costo mínimo y optimiza con uᵢ + vⱼ = cᵢⱼ hasta Δᵢⱼ >= 0.",
    optimo: "Vogel + MODI: obtiene solución inicial por Vogel y optimiza mediante uᵢ + vⱼ = cᵢⱼ hasta que Δᵢⱼ = cᵢⱼ - (uᵢ + vⱼ) >= 0."
  };

  const tipoObjTexto = modelo.objetivo === "maximizar" ? "Maximizar Z" : "Minimizar Z";

  return {
    balance: `Σ aᵢ (Oferta) = ${formatearNumero(sumaOferta)}  vs.  Σ bⱼ (Demanda) = ${formatearNumero(sumaDemanda)}`,
    objetivo: `${tipoObjTexto} = ${terminosObjetivo.join(" + ")}`,
    restricciones: `Oferta: Σⱼ xᵢⱼ = aᵢ (i=1..${modelo.ofertas.length})  |  Demanda: Σᵢ xᵢⱼ = bⱼ (j=1..${modelo.demandas.length})  |  xᵢⱼ >= 0`,
    metodo: descripcionesMetodo[metodo] || descripcionesMetodo.optimo
  };
}

function crearTablaVisual(modelo, asignacion) {
  let html = '<table class="tabla-transporte"><thead><tr><th>Origen \\ Destino</th>';
  for (const destino of modelo.nombresDestinos) {
    html += `<th>${escaparTexto(destino)}</th>`;
  }
  html += "<th>Oferta</th></tr></thead><tbody>";

  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    html += `<tr><th>${escaparTexto(modelo.nombresOrigenes[i])}</th>`;
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const cantidad = asignacion[i][j];
      const esProhibida = modelo.prohibidas[i][j];
      const etiquetaValor = esProhibida ? "M (Prohibida)" : `${modelo.objetivo === "maximizar" ? "utilidad" : "costo"}: ${formatearNumero(modelo.costos[i][j])}`;
      const claseActiva = cantidad > EPS ? (esProhibida ? "celda-error" : "celda-asignada") : "";
      html += `<td class="${claseActiva}">
        <span>${formatearNumero(cantidad)}</span>
        <span class="sub-costo">${etiquetaValor}</span>
      </td>`;
    }
    html += `<th>${formatearNumero(modelo.ofertas[i])}</th></tr>`;
  }

  html += "<tr><th>Demanda</th>";
  for (const dem of modelo.demandas) {
    html += `<th>${formatearNumero(dem)}</th>`;
  }
  const total = redondearSiCero(modelo.ofertas.reduce((acc, v) => acc + v, 0));
  html += `<th>${formatearNumero(total)}</th></tr></tbody></table>`;
  return html;
}

function renderizarResultados({
  modelo,
  estadoSolucion,
  invariantes,
  comparativa,
  pasos,
  modo,
  metodo,
  balanceadoOriginalmente
}) {
  const { asignacion, optimosAlternativos } = estadoSolucion;
  const seccion = document.getElementById("seccionResultados");
  seccion.classList.remove("oculto");

  const formulacion = construirFormulacion(modelo, metodo);
  document.getElementById("formulaBalance").textContent = formulacion.balance;
  document.getElementById("formulaObjetivo").textContent = formulacion.objetivo;
  document.getElementById("formulaRestricciones").textContent = formulacion.restricciones;
  document.getElementById("formulaMetodo").textContent = formulacion.metodo;

  const valorTotal = calcularValorRealTotal(asignacion, modelo.costos, modelo.prohibidas);
  const etiquetaTotal = modelo.objetivo === "maximizar" ? "Ganancia Total Resultante" : "Costo Total Resultante";
  const etiquetaUnitario = modelo.objetivo === "maximizar" ? "utilidad" : "costo";
  const enviosDetalle = [];

  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      if (asignacion[i][j] > EPS) {
        if (modelo.prohibidas[i][j]) {
          enviosDetalle.push(
            `<li><strong>${escaparTexto(modelo.nombresOrigenes[i])} -> ${escaparTexto(modelo.nombresDestinos[j])}</strong>: ${formatearNumero(asignacion[i][j])} unidades en <strong>Ruta Prohibida (M)</strong></li>`
          );
        } else {
          const subtotal = redondearSiCero(asignacion[i][j] * modelo.costos[i][j]);
          enviosDetalle.push(
            `<li><strong>${escaparTexto(modelo.nombresOrigenes[i])}</strong> -> <strong>${escaparTexto(modelo.nombresDestinos[j])}</strong>: ${formatearNumero(asignacion[i][j])} unidades x ${etiquetaUnitario} ${formatearNumero(modelo.costos[i][j])} = <strong>${formatearNumero(subtotal)}</strong></li>`
          );
        }
      }
    }
  }

  const notaBalance = balanceadoOriginalmente
    ? ""
    : `<p class="alerta alerta-aviso">Nota: El modelo fue balanceado automáticamente agregando un nodo ficticio con valor 0.</p>`;

  let notaEstado = "";
  if (invariantes.infactiblePorProhibidas) {
    notaEstado = `<p class="alerta alerta-error">El modelo es infactible bajo las restricciones de rutas prohibidas: requiere enviar flujo por una ruta marcada como M.</p>`;
  } else if (!invariantes.esValida) {
    notaEstado = `<p class="alerta alerta-error">Se detectaron incidencias de verificación: ${escaparTexto(invariantes.incidencias.join(" | "))}</p>`;
  } else {
    notaEstado = `<p class="alerta alerta-ok">Solución básica factible verificada (ofertas, demandas y condición m + n - 1 cumplidas).</p>`;
  }

  let notaAlternativos = "";
  if (optimosAlternativos && optimosAlternativos.length > 0 && !invariantes.infactiblePorProhibidas) {
    const listaCeldas = optimosAlternativos
      .map((c) => `(${escaparTexto(modelo.nombresOrigenes[c.i])} -> ${escaparTexto(modelo.nombresDestinos[c.j])})`)
      .join(", ");
    notaAlternativos = `<p class="alerta alerta-aviso">Existen soluciones óptimas alternativas con el mismo valor total (Δ = 0 en: ${listaCeldas}).</p>`;
  }

  document.getElementById("resumenSolucion").innerHTML = `
    <h3>${etiquetaTotal}: ${invariantes.infactiblePorProhibidas ? "Infactible (usa ruta M)" : formatearNumero(valorTotal)}</h3>
    <p>Objetivo: <strong>${modelo.objetivo === "maximizar" ? "Maximizar" : "Minimizar"}</strong> | Modo: <strong>${modo === "guiado" ? "Guiado / Paso a Paso" : "Global / Directo"}</strong> | Método: <strong>${escaparTexto(metodo)}</strong></p>
    ${notaEstado}
    ${notaBalance}
    ${notaAlternativos}
    <ul>${enviosDetalle.join("") || "<li>No hay asignaciones positivas.</li>"}</ul>
  `;

  const contComp = document.getElementById("contenedorComparativa");
  if (comparativa) {
    contComp.classList.remove("oculto");
    const filasComp = comparativa.resultados
      .map((r) => {
        const esOptimo = !r.infactible && comparativa.mejorValor !== null && Math.abs(r.valorTotal - comparativa.mejorValor) <= EPS;
        const dif =
          r.infactible || comparativa.mejorValor === null
            ? "-"
            : formatearNumero(Math.abs(r.valorTotal - comparativa.mejorValor));
        return `<tr>
          <td>${escaparTexto(r.nombre)}</td>
          <td>${r.infactible ? "Infactible" : formatearNumero(r.valorTotal)}</td>
          <td>${r.iteracionesMODI}</td>
          <td>${dif}</td>
          <td>${r.infactible ? "Infactible" : esOptimo ? "Óptimo" : "Factible"}</td>
        </tr>`;
      })
      .join("");

    contComp.innerHTML = `
      <h3>Comparativa de Eficiencia entre Métodos</h3>
      <table class="tabla-transporte">
        <thead>
          <tr>
            <th>Método</th>
            <th>Valor Total (Z)</th>
            <th>Iteraciones MODI</th>
            <th>Brecha vs. Óptimo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>${filasComp}</tbody>
      </table>
    `;
  } else {
    contComp.innerHTML = "";
    contComp.classList.add("oculto");
  }

  document.getElementById("contenedorTablaFinal").innerHTML = crearTablaVisual(modelo, asignacion);

  const contenedorPasos = document.getElementById("contenedorPasos");
  if (modo === "global") {
    estadoAplicacion.ultimoModeloRender = null;
    estadoAplicacion.ultimosPasosRender = [];
    contenedorPasos.innerHTML = "";
    contenedorPasos.classList.add("oculto");
  } else {
    estadoAplicacion.ultimoModeloRender = modelo;
    estadoAplicacion.ultimosPasosRender = pasos;
    estadoAplicacion.indicePasoActual = 0;
    contenedorPasos.classList.remove("oculto");
    renderizarContenedorPasos();
  }

  estadoAplicacion.ultimoResumenContexto = {
    modelo,
    estadoSolucion,
    invariantes,
    comparativa,
    pasos,
    modo,
    metodo,
    balanceadoOriginalmente
  };
  renderizarResumenFinalDetallado();

  if (!estadoAplicacion._restaurandoDesdeStorage) {
    seccion.scrollIntoView({ behavior: "smooth", block: "start" });
    const tituloRes = document.getElementById("titulo-resultados");
    if (tituloRes) tituloRes.focus({ preventScroll: true });
  }
}

/* ---------- 7B. DICCIONARIOS DINÁMICOS Y RESUMEN FINAL DETALLADO ---------- */

const DICCIONARIO_NARRATIVO = {
  balanceoEquilibrado: [
    (d) =>
      `1. Balanceo del modelo: Al sumar las disponibilidades y requerimientos se obtuvo Σ aᵢ = ${d.sumaOferta} y Σ bⱼ = ${d.sumaDemanda}. Como ambas cantidades coinciden exactamente, el sistema se encuentra equilibrado y no requiere nodos ficticios.`,
    (d) =>
      `1. Verificación de equilibrio: La oferta agregada (${d.sumaOferta} unidades) iguala a la demanda total (${d.sumaDemanda} unidades). Gracias a este balance directo, la matriz original trabaja sin filas ni columnas auxiliares.`,
    (d) =>
      `1. Consistencia oferta-demanda: Se comprobó la condición Σ aᵢ = Σ bⱼ (${d.sumaOferta} = ${d.sumaDemanda}), confirmando un modelo balanceado de forma nativa.`
  ],
  balanceoFicticioDestino: [
    (d) =>
      `1. Balanceo con Destino Ficticio: La oferta total (${d.sumaOferta}) supera a la demanda total (${d.sumaDemanda}) por ${d.diferencia} unidades. Por ello se incorporó la columna "Destino Ficticio" con demanda ${d.diferencia} y costo unitario 0 (fórmula: b_fic = ${d.sumaOferta} - ${d.sumaDemanda} = ${d.diferencia}).`,
    (d) =>
      `1. Ajuste por exceso de oferta: Al existir un excedente de ${d.diferencia} unidades (${d.sumaOferta} disponibles frente a ${d.sumaDemanda} requeridas), se añadió un Destino Ficticio de demanda ${d.diferencia} y coeficiente 0 para absorber el sobrante sin distorsionar el cálculo.`,
    (d) =>
      `1. Equilibrio del sistema: Como Σ aᵢ > Σ bⱼ (${d.sumaOferta} > ${d.sumaDemanda}), se balanceó la red creando el nodo "Destino Ficticio" con ${d.diferencia} unidades y costo nulo.`
  ],
  balanceoFicticioOrigen: [
    (d) =>
      `1. Balanceo con Origen Ficticio: La demanda total (${d.sumaDemanda}) supera a la oferta total (${d.sumaOferta}) por ${d.diferencia} unidades. Se agregó la fila "Origen Ficticio" con oferta ${d.diferencia} y costo unitario 0 (fórmula: a_fic = ${d.sumaDemanda} - ${d.sumaOferta} = ${d.diferencia}).`,
    (d) =>
      `1. Ajuste por déficit de oferta: Para cubrir la brecha de ${d.diferencia} unidades entre demanda (${d.sumaDemanda}) y oferta (${d.sumaOferta}), se creó un Origen Ficticio con capacidad ${d.diferencia} y valor unitario 0.`,
    (d) =>
      `1. Equilibrio del sistema: Dado que Σ bⱼ > Σ aᵢ (${d.sumaDemanda} > ${d.sumaOferta}), se incorporó el nodo "Origen Ficticio" con ${d.diferencia} unidades para igualar ambos totales en ${d.sumaDemanda}.`
  ],
  conversionMaximizacion: [
    (d) =>
      `2. Conversión de Maximización: Se identificó la utilidad máxima V_max = ${d.maxValorReal} y se transformó la matriz mediante c'ᵢⱼ = ${d.maxValorReal} - pᵢⱼ para aplicar minimización equivalente de costo de oportunidad (evaluando al final sobre los valores reales pᵢⱼ).`,
    (d) =>
      `2. Transformación del objetivo: Para maximizar la ganancia usando el motor de transporte, cada utilidad pᵢⱼ se convirtió en pérdida relativa c'ᵢⱼ = ${d.maxValorReal} - pᵢⱼ tomando como referencia V_max = ${d.maxValorReal}.`,
    (d) =>
      `2. Equivalencia matemática (Max -> Min): Con V_max = ${d.maxValorReal}, se construyó la matriz auxiliar c'ᵢⱼ = V_max - pᵢⱼ; minimizar esta matriz garantiza encontrar el plan que maximiza la utilidad real.`
  ],
  noroeste: [
    (d) =>
      `Solución inicial por Esquina Noroeste: Se partió de la celda superior izquierda siguiendo la regla posicional xᵢⱼ = min(aᵢ, bⱼ) en ${d.cantidadPasos} paso(s), iniciando en ${d.primerPaso}. Las asignaciones obtenidas fueron: ${d.resumenAsignaciones}, alcanzando un valor inicial de Z = ${d.valorInicial}.`,
    (d) =>
      `Fase inicial (Esquina Noroeste): Recorriendo la tabla de izquierda a derecha y de arriba hacia abajo sin evaluar costos unitarios (${d.cantidadPasos} asignaciones desde ${d.primerPaso}), se obtuvo la base inicial: ${d.resumenAsignaciones}, con total Z = ${d.valorInicial}.`,
    (d) =>
      `Construcción por Esquina Noroeste: Aplicando agotamiento secuencial de filas y columnas a partir de ${d.primerPaso}, se definieron ${d.cantidadPasos} envíos iniciales (${d.resumenAsignaciones}), resultando en Z = ${d.valorInicial}.`
  ],
  costoMenor: [
    (d) =>
      `Solución inicial por Costo Mínimo: En cada ronda se seleccionó la celda activa más favorable (menor costo equivalente, iniciando en ${d.primerPaso}), completando ${d.cantidadPasos} asignaciones: ${d.resumenAsignaciones}, con un valor inicial de Z = ${d.valorInicial}.`,
    (d) =>
      `Fase inicial (Costo Mínimo): Priorizando las rutas de menor valor unitario en ${d.cantidadPasos} pasos (comenzando por ${d.primerPaso}), se construyó la distribución: ${d.resumenAsignaciones}, obteniendo Z = ${d.valorInicial}.`,
    (d) =>
      `Construcción voraz (Costo Mínimo): Se asignó el máximo posible xᵢⱼ = min(aᵢ, bⱼ) en las celdas más económicas desde ${d.primerPaso}, quedando ${d.resumenAsignaciones} con total inicial Z = ${d.valorInicial}.`
  ],
  vogel: [
    (d) =>
      `Solución inicial por Aproximación de Vogel (VAM): Se calcularon las penalizaciones (diferencia entre los 2 menores valores por fila y columna) en ${d.cantidadPasos} paso(s), iniciando en ${d.primerPaso}. Esto generó la base: ${d.resumenAsignaciones}, con Z = ${d.valorInicial}.`,
    (d) =>
      `Fase inicial (Vogel / VAM): Evaluando el costo de oportunidad en cada fila y columna activa desde ${d.primerPaso}, se realizaron ${d.cantidadPasos} asignaciones (${d.resumenAsignaciones}), logrando un punto de partida de Z = ${d.valorInicial}.`,
    (d) =>
      `Construcción por penalizaciones (Vogel): Al elegir en cada iteración la línea con mayor penalización y asignar a su mejor celda (empezando por ${d.primerPaso}), se obtuvo ${d.resumenAsignaciones} con valor Z = ${d.valorInicial}.`
  ],
  degeneracion: [
    (d) =>
      `Ajuste de degeneración (m + n - 1): Como la base inicial tuvo menos de ${d.requeridas} variables básicas, se incorporaron ${d.cantidadEpsilon} celda(s) independiente(s) con valor ε ≈ 0 en ${d.celdasEpsilon} sin cerrar ciclos, garantizando poder resolver uᵢ + vⱼ = cᵢⱼ.`,
    (d) =>
      `Resolución de degeneración: Para completar las m + n - 1 = ${d.requeridas} celdas básicas requeridas por MODI, se marcaron ${d.cantidadEpsilon} celda(s) auxiliar(es) con flujo nulo ε en ${d.celdasEpsilon} preservando la estructura de árbol sin ciclos.`,
    (d) =>
      `Mantenimiento de base acíclica: Se añadieron ${d.cantidadEpsilon} asignación(es) conceptual(es) ε (≈ 0) en ${d.celdasEpsilon} para alcanzar exactamente ${d.requeridas} variables básicas y evitar indeterminaciones en los multiplicadores.`
  ],
  modi: [
    (d) =>
      `Optimización con MODI (uᵢ + vⱼ = cᵢⱼ): Se ejecutaron ${d.iteraciones} iteración(es) de mejora (${d.detalleIteraciones}). En la evaluación final con multiplicadores ${d.multiplicadoresFinales}, todas las celdas vacías cumplieron Δᵢⱼ = cᵢⱼ - (uᵢ + vⱼ) >= 0, confirmando el valor final Z = ${d.valorFinal}.`,
    (d) =>
      `Fase de optimalidad (MODI): Mediante los multiplicadores ${d.multiplicadoresFinales} y la prueba de costos marginales Δᵢⱼ >= 0 tras ${d.iteraciones} pivote(s) en ciclo cerrado (${d.detalleIteraciones}), se alcanzó el resultado óptimo Z = ${d.valorFinal}.`,
    (d) =>
      `Refinamiento exacto con MODI: Después de ${d.iteraciones} ajuste(s) sobre ciclos alternantes (+ / -) (${d.detalleIteraciones}), los potenciales finales ${d.multiplicadoresFinales} verificaron que ningún intercambio mejora el total Z = ${d.valorFinal}.`
  ],
  cierreOptimo: [
    (d) =>
      `Conclusión del resultado: El plan final establece ${d.objetivoTexto} = ${d.valorTotal} mediante la suma ${d.formulaSumaTotal}, distribuyendo las unidades en: ${d.rutasActivasTexto}.${d.textoAlternativos}`,
    (d) =>
      `Síntesis final: Aplicando la función objetivo (${d.formulaSumaTotal}), se obtiene ${d.objetivoTexto} = ${d.valorTotal} con las rutas activas: ${d.rutasActivasTexto}.${d.textoAlternativos}`,
    (d) =>
      `Resumen ejecutivo: La solución final reporta ${d.objetivoTexto} = ${d.valorTotal} (${d.formulaSumaTotal}) cubriendo todas las ofertas y demandas mediante: ${d.rutasActivasTexto}.${d.textoAlternativos}`
  ],
  cierreInfactible: [
    (d) =>
      `Conclusión de factibilidad: El modelo resultó infactible porque bajo las restricciones actuales de oferta, demanda y rutas prohibidas (M) se requiere enviar flujo por rutas bloqueadas (${d.rutasProhibidasUsadas}).`,
    (d) =>
      `Resultado infactible: No existe una asignación válida que evite las rutas marcadas con M; el flujo quedó retenido en ${d.rutasProhibidasUsadas}.`,
    (d) =>
      `Diagnóstico de infactibilidad: Las rutas prohibidas (M) impiden satisfacer simultáneamente ofertas y demandas sin utilizar enlaces bloqueados (${d.rutasProhibidasUsadas}).`
  ]
};

function elegirPlantillaDiccionario(claveProceso, varianteIdx) {
  const lista = DICCIONARIO_NARRATIVO[claveProceso];
  if (!lista || lista.length === 0) return () => "";
  const idx = Math.abs(varianteIdx) % lista.length;
  return lista[idx];
}

function construirResumenNarrativoDinamico({ modelo, estadoSolucion, invariantes, pasos, metodo, varianteIdx = 0 }) {
  const parrafos = [];
  const sumaOferta = formatearNumero(modelo.ofertas.reduce((acc, v) => acc + v, 0));
  const sumaDemanda = formatearNumero(modelo.demandas.reduce((acc, v) => acc + v, 0));

  // 1. Balanceo (aislado)
  const pasoBalance = pasos.find((p) => p.fase === "Balanceo");
  const totalOfertaNum = redondearSiCero(modelo.ofertas.reduce((acc, v) => acc + v, 0));
  const totalDemandaNum = redondearSiCero(modelo.demandas.reduce((acc, v) => acc + v, 0));

  if (pasoBalance && pasoBalance.titulo.includes("Destino Ficticio")) {
    const difNum = modelo.demandas[modelo.demandas.length - 1];
    parrafos.push(
      elegirPlantillaDiccionario("balanceoFicticioDestino", varianteIdx)({
        sumaOferta: formatearNumero(totalOfertaNum),
        sumaDemanda: formatearNumero(redondearSiCero(totalOfertaNum - difNum)),
        diferencia: formatearNumero(difNum)
      })
    );
  } else if (pasoBalance && pasoBalance.titulo.includes("Origen Ficticio")) {
    const difNum = modelo.ofertas[modelo.ofertas.length - 1];
    parrafos.push(
      elegirPlantillaDiccionario("balanceoFicticioOrigen", varianteIdx)({
        sumaOferta: formatearNumero(redondearSiCero(totalDemandaNum - difNum)),
        sumaDemanda: formatearNumero(totalDemandaNum),
        diferencia: formatearNumero(difNum)
      })
    );
  } else {
    parrafos.push(
      elegirPlantillaDiccionario("balanceoEquilibrado", varianteIdx)({
        sumaOferta,
        sumaDemanda
      })
    );
  }

  // 2. Conversión si es maximización (aislado)
  if (modelo.objetivo === "maximizar") {
    parrafos.push(
      elegirPlantillaDiccionario("conversionMaximizacion", varianteIdx)({
        maxValorReal: formatearNumero(modelo.maxValorReal)
      })
    );
  }

  // 3. Método inicial (estrictamente separado por método, imposible cruzar diccionarios)
  let claveMetodoInicial = "vogel";
  let nombreFaseInicial = "Aproximación de Vogel";
  if (metodo === "noroeste" || metodo === "noroesteModi") {
    claveMetodoInicial = "noroeste";
    nombreFaseInicial = "Esquina Noroeste";
  } else if (metodo === "costoMenor" || metodo === "costoMenorModi") {
    claveMetodoInicial = "costoMenor";
    nombreFaseInicial = "Costo Menor";
  }

  const pasosIniciales = pasos.filter((p) => p.fase === nombreFaseInicial);
  if (pasosIniciales.length > 0) {
    const primerPaso = pasosIniciales[0].titulo;
    const ultimoPasoInicial = pasosIniciales[pasosIniciales.length - 1];
    const valorInicial = formatearNumero(ultimoPasoInicial.costoAcumulado ?? 0);
    const resumenAsignaciones = pasosIniciales.map((p) => p.titulo.replace(/^Asignar\s+|^Asignación directa\s+/i, "")).join("; ");
    parrafos.push(
      elegirPlantillaDiccionario(claveMetodoInicial, varianteIdx)({
        cantidadPasos: pasosIniciales.length,
        primerPaso,
        resumenAsignaciones,
        valorInicial
      })
    );
  }

  // 4. Degeneración si existió (aislado)
  const pasosDeg = pasos.filter((p) => p.fase === "Ajuste de Degeneración");
  if (pasosDeg.length > 0) {
    const requeridas = modelo.ofertas.length + modelo.demandas.length - 1;
    const celdasEpsilon = pasosDeg
      .map((p) => {
        const match = p.titulo.match(/\(([^)]+)\)$/);
        return match ? `(${match[1]})` : p.titulo;
      })
      .join(", ");
    parrafos.push(
      elegirPlantillaDiccionario("degeneracion", varianteIdx)({
        requeridas,
        cantidadEpsilon: pasosDeg.length,
        celdasEpsilon
      })
    );
  }

  // 5. MODI si aplicó (aislado)
  const usaModi = metodo === "optimo" || metodo === "noroesteModi" || metodo === "costoMenorModi";
  if (usaModi) {
    const pasosModi = pasos.filter((p) => p.fase === "Optimización MODI");
    const pasosIter = pasosModi.filter((p) => p.titulo.startsWith("Iteración"));
    const pasoOpt = pasosModi.find((p) => p.titulo.includes("Solución óptima"));
    const multMatch = pasoOpt?.formula?.match(/u = \[[^\]]+\]\s*\|\s*v = \[[^\]]+\]/);
    const multiplicadoresFinales = multMatch ? multMatch[0] : "uᵢ, vⱼ verificados";
    const detalleIteraciones =
      pasosIter.length > 0
        ? pasosIter.map((p) => `${p.titulo} [${p.formula.split("|").slice(0, 2).join("|").trim()}]`).join("; ")
        : "la solución inicial ya cumplía Δᵢⱼ >= 0 sin requerir pivotes";
    const valorFinal = formatearNumero(
      calcularValorRealTotal(estadoSolucion.asignacion, modelo.costos, modelo.prohibidas)
    );

    parrafos.push(
      elegirPlantillaDiccionario("modi", varianteIdx)({
        iteraciones: pasosIter.length,
        detalleIteraciones,
        multiplicadoresFinales,
        valorFinal
      })
    );
  }

  // 6. Cierre final con valores reales (aislado)
  const rutasActivas = [];
  const rutasProhibidasUsadas = [];
  const terminosSuma = [];
  const productosSuma = [];

  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const x = estadoSolucion.asignacion[i][j];
      if (x > EPS) {
        if (modelo.prohibidas[i][j]) {
          rutasProhibidasUsadas.push(`x_${i + 1}${j + 1} (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]}) = ${formatearNumero(x)}`);
        } else {
          const c = modelo.costos[i][j];
          const sub = redondearSiCero(x * c);
          rutasActivas.push(`x_${i + 1}${j + 1} (${modelo.nombresOrigenes[i]} -> ${modelo.nombresDestinos[j]}) = ${formatearNumero(x)}`);
          terminosSuma.push(`(${formatearNumero(x)} × ${formatearNumero(c)})`);
          productosSuma.push(formatearNumero(sub));
        }
      }
    }
  }

  const valorTotal = formatearNumero(
    calcularValorRealTotal(estadoSolucion.asignacion, modelo.costos, modelo.prohibidas)
  );
  const objetivoTexto = modelo.objetivo === "maximizar" ? "Ganancia Total (Z)" : "Costo Total (Z)";
  const formulaSumaTotal =
    terminosSuma.length > 0
      ? `Z = ${terminosSuma.join(" + ")} = ${productosSuma.join(" + ")} = ${valorTotal}`
      : `Z = ${valorTotal}`;

  if (invariantes.infactiblePorProhibidas) {
    parrafos.push(
      elegirPlantillaDiccionario("cierreInfactible", varianteIdx)({
        rutasProhibidasUsadas: rutasProhibidasUsadas.join(", ")
      })
    );
  } else {
    const alts = estadoSolucion.optimosAlternativos || [];
    const textoAlternativos =
      alts.length > 0
        ? ` Nota: Existen ${alts.length} ruta(s) no básica(s) con Δ = 0, por lo que hay soluciones óptimas alternativas con el mismo total.`
        : "";
    parrafos.push(
      elegirPlantillaDiccionario("cierreOptimo", varianteIdx)({
        objetivoTexto,
        valorTotal,
        formulaSumaTotal,
        rutasActivasTexto: rutasActivas.join(", "),
        textoAlternativos
      })
    );
  }

  return {
    parrafos,
    formulaSumaTotal,
    valorTotal,
    objetivoTexto
  };
}

function renderizarResumenFinalDetallado() {
  const contenedor = document.getElementById("resumenFinalDetallado");
  const ctx = estadoAplicacion.ultimoResumenContexto;
  if (!contenedor || !ctx) return;

  const { modelo, estadoSolucion, invariantes, pasos, metodo } = ctx;
  const { asignacion } = estadoSolucion;
  const etiquetaUnit = modelo.objetivo === "maximizar" ? "utilidad" : "costo";

  let cardsVariables = "";
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const val = asignacion[i][j];
      const esProhibida = modelo.prohibidas[i][j];
      const esBasica = estadoSolucion.basicas?.[i]?.[j] ?? false;
      const claseVar = val > EPS ? "variable-activa" : "variable-cero";
      const sub = esProhibida ? "Ruta M" : formatearNumero(redondearSiCero(val * modelo.costos[i][j]));
      const infoBasica = val <= EPS && esBasica ? " (básica ε)" : "";

      cardsVariables += `
        <div class="tarjeta-variable ${claseVar}">
          <strong>x<sub>${i + 1}${j + 1}</sub> = ${formatearNumero(val)}${infoBasica}</strong>
          <div>${escaparTexto(modelo.nombresOrigenes[i])} &rarr; ${escaparTexto(modelo.nombresDestinos[j])}</div>
          <div>${esProhibida ? "Ruta prohibida (M)" : `${etiquetaUnit}: ${formatearNumero(modelo.costos[i][j])} | subtotal: ${sub}`}</div>
        </div>
      `;
    }
  }

  const narrativa = construirResumenNarrativoDinamico({
    modelo,
    estadoSolucion,
    invariantes,
    pasos,
    metodo,
    varianteIdx: estadoAplicacion.varianteDiccionario
  });

  const parrafosHtml = narrativa.parrafos
    .map((p) => `<p class="parrafo-narrativo">${escaparTexto(p)}</p>`)
    .join("");

  contenedor.innerHTML = `
    <div class="cabecera-pasos">
      <h3>4. Resumen Final: Variables de Decisión, Total y Explicación</h3>
      <button type="button" id="btnCambiarRedaccion" class="boton boton-secundario">
        Cambiar redacción de la explicación
      </button>
    </div>

    <h4>Valor de cada variable (xᵢⱼ)</h4>
    <div class="rejilla-variables">${cardsVariables}</div>

    <h4>${escaparTexto(narrativa.objetivoTexto)}</h4>
    <p class="formula-paso">${escaparTexto(narrativa.formulaSumaTotal)}</p>

    <div class="bloque-narrativa">
      <h4>Explicación detallada del procedimiento</h4>
      ${parrafosHtml}
    </div>
  `;

  document.getElementById("btnCambiarRedaccion")?.addEventListener("click", () => {
    estadoAplicacion.varianteDiccionario++;
    renderizarResumenFinalDetallado();
    guardarEstadoLocalStorage();
  });
}

function renderizarContenedorPasos() {
  const contenedorPasos = document.getElementById("contenedorPasos");
  const modelo = estadoAplicacion.ultimoModeloRender;
  const pasos = estadoAplicacion.ultimosPasosRender;

  if (!modelo || !pasos || pasos.length === 0) {
    contenedorPasos.innerHTML = "";
    return;
  }

  const total = pasos.length;
  if (estadoAplicacion.indicePasoActual >= total) {
    estadoAplicacion.indicePasoActual = total - 1;
  }
  if (estadoAplicacion.indicePasoActual < 0) {
    estadoAplicacion.indicePasoActual = 0;
  }

  const etiquetaAcumulado = modelo.objetivo === "maximizar" ? "Ganancia acumulada" : "Costo acumulado";
  const pasosAMostrar = estadoAplicacion.verTodosLosPasos
    ? pasos
    : [pasos[estadoAplicacion.indicePasoActual]];

  let pasosHtml = `
    <div class="cabecera-pasos">
      <h3>Desglose Paso a Paso (Modo Guiado)</h3>
      <div class="controles-pasos" role="toolbar" aria-label="Navegación de pasos en modo guiado">
        <button type="button" id="btnPasoAnterior" class="boton boton-secundario" ${estadoAplicacion.verTodosLosPasos || estadoAplicacion.indicePasoActual === 0 ? "disabled" : ""}>
          &lt; Paso Anterior
        </button>
        <span class="indicador-paso" aria-live="polite">
          ${estadoAplicacion.verTodosLosPasos ? `Mostrando todos (${total} pasos)` : `Paso ${estadoAplicacion.indicePasoActual + 1} de ${total}`}
        </span>
        <button type="button" id="btnPasoSiguiente" class="boton boton-secundario" ${estadoAplicacion.verTodosLosPasos || estadoAplicacion.indicePasoActual >= total - 1 ? "disabled" : ""}>
          Paso Siguiente &gt;
        </button>
        <button type="button" id="btnAlternarVistaPasos" class="boton boton-primario">
          ${estadoAplicacion.verTodosLosPasos ? "Ver Paso a Paso (1 a la vez)" : "Ver Todos los Pasos"}
        </button>
      </div>
    </div>
  `;

  for (const paso of pasosAMostrar) {
    const bloqueAcumulado =
      paso.costoAcumulado !== null && paso.costoAcumulado !== undefined
        ? `<p class="acumulado-paso"><strong>${etiquetaAcumulado} en este paso:</strong> ${formatearNumero(paso.costoAcumulado)}</p>`
        : "";
    pasosHtml += `
      <article class="tarjeta-paso">
        <div class="tarjeta-paso-cabecera">
          <strong>Paso ${paso.numero}: ${escaparTexto(paso.titulo)}</strong>
          <span class="insignia-fase">${escaparTexto(paso.fase)}</span>
        </div>
        <p>${escaparTexto(paso.explicacion)}</p>
        ${paso.formula ? `<p class="formula-paso">${escaparTexto(paso.formula)}</p>` : ""}
        ${bloqueAcumulado}
        ${
          paso.asignacion
            ? `<div class="contenedor-tabla" style="margin-top:0.65rem">${crearTablaVisual(modelo, paso.asignacion)}</div>`
            : ""
        }
      </article>
    `;
  }

  contenedorPasos.innerHTML = pasosHtml;

  document.getElementById("btnPasoAnterior")?.addEventListener("click", () => {
    if (estadoAplicacion.indicePasoActual > 0) {
      estadoAplicacion.indicePasoActual--;
      renderizarContenedorPasos();
      guardarEstadoLocalStorage();
    }
  });
  document.getElementById("btnPasoSiguiente")?.addEventListener("click", () => {
    if (estadoAplicacion.indicePasoActual < total - 1) {
      estadoAplicacion.indicePasoActual++;
      renderizarContenedorPasos();
      guardarEstadoLocalStorage();
    }
  });
  document.getElementById("btnAlternarVistaPasos")?.addEventListener("click", () => {
    estadoAplicacion.verTodosLosPasos = !estadoAplicacion.verTodosLosPasos;
    renderizarContenedorPasos();
    guardarEstadoLocalStorage();
  });
}

/* ---------- 8. ORQUESTACIÓN PRINCIPAL Y EVENTOS ---------- */

function mostrarError(mensajes) {
  const caja = document.getElementById("mensajeValidacion");
  caja.innerHTML = mensajes.map((m) => `<div>- ${escaparTexto(m)}</div>`).join("");
  caja.classList.remove("oculto");
}

function ocultarError() {
  const caja = document.getElementById("mensajeValidacion");
  caja.textContent = "";
  caja.classList.add("oculto");
}

function ejecutarResolucion() {
  ocultarError();
  const modeloEntrada = leerModeloDesdeFormulario();
  const errores = validarModelo(modeloEntrada);

  if (errores.length > 0) {
    mostrarError(errores);
    return;
  }

  estadoAplicacion.ultimaConfiguracion = {
    objetivo: modeloEntrada.objetivo,
    filas: modeloEntrada.ofertas.length,
    columnas: modeloEntrada.demandas.length,
    nombresOrigenes: [...modeloEntrada.nombresOrigenes],
    nombresDestinos: [...modeloEntrada.nombresDestinos],
    costos: clonarMatriz(modeloEntrada.costos),
    prohibidas: clonarMatriz(modeloEntrada.prohibidas),
    ofertas: [...modeloEntrada.ofertas],
    demandas: [...modeloEntrada.demandas]
  };

  const modo = obtenerModoSeleccionado();
  const metodo = obtenerMetodoSeleccionado();
  const pasos = [];

  const { modelo: modeloBalanceado, balanceadoOriginalmente } = balancearModelo(modeloEntrada, pasos);
  const estadoSolucion = ejecutarEstrategia(modeloBalanceado, metodo, pasos);
  const invariantes = verificarInvariantes(modeloBalanceado, estadoSolucion.asignacion, estadoSolucion.basicas);
  const comparativa = debeMostrarComparativa() ? generarComparativaMetodos(modeloBalanceado) : null;

  renderizarResultados({
    modelo: modeloBalanceado,
    estadoSolucion,
    invariantes,
    comparativa,
    pasos,
    modo,
    metodo,
    balanceadoOriginalmente
  });
  guardarEstadoLocalStorage();
}

const EJEMPLOS_TRANSPORTE = {
  managua: {
    objetivo: "minimizar",
    nombresOrigenes: ["Taller A", "Taller B", "Taller C"],
    nombresDestinos: ["Mercado Oriental", "Mercado Roberto Huembes", "Mercado Israel Lewites"],
    costos: [
      [4, 6, 8],
      [5, 0, 7],
      [6, 5, 4]
    ],
    prohibidas: [
      [false, false, false],
      [false, false, false],
      [false, false, false]
    ],
    ofertas: [40, 35, 25],
    demandas: [30, 40, 30]
  },
  fabricas3x4: {
    objetivo: "minimizar",
    nombresOrigenes: ["Fábrica 1", "Fábrica 2", "Fábrica 3"],
    nombresDestinos: ["Almacén 1", "Almacén 2", "Almacén 3", "Almacén 4"],
    costos: [
      [19, 30, 50, 10],
      [70, 30, 40, 60],
      [40, 8, 70, 20]
    ],
    prohibidas: [
      [false, false, false, false],
      [false, false, false, false],
      [false, false, false, false]
    ],
    ofertas: [7, 9, 18],
    demandas: [5, 8, 7, 14]
  },
  maximizacion: {
    objetivo: "maximizar",
    nombresOrigenes: ["Planta 1", "Planta 2", "Planta 3"],
    nombresDestinos: ["Bodega 1", "Bodega 2", "Bodega 3"],
    costos: [
      [8, 5, 6],
      [15, 10, 12],
      [3, 9, 10]
    ],
    prohibidas: [
      [false, false, false],
      [false, false, false],
      [false, false, false]
    ],
    ofertas: [120, 80, 80],
    demandas: [150, 80, 50]
  },
  prohibidas: {
    objetivo: "minimizar",
    nombresOrigenes: ["Centro Norte", "Centro Sur", "Centro Este"],
    nombresDestinos: ["Zona A", "Zona B", "Zona C"],
    costos: [
      [0, 6, 4],
      [5, 3, 0],
      [7, 4, 2]
    ],
    prohibidas: [
      [true, false, false],
      [false, false, true],
      [false, false, false]
    ],
    ofertas: [30, 45, 35],
    demandas: [35, 30, 25]
  }
};

function cargarEjemploSeleccionado() {
  const selector = document.getElementById("selectorEjemplo");
  const clave = selector ? selector.value : "managua";
  const datos = EJEMPLOS_TRANSPORTE[clave] || EJEMPLOS_TRANSPORTE.managua;
  generarTablaEntrada(datos);
  guardarEstadoLocalStorage();
}

function cargarEjemploTalleresManagua() {
  generarTablaEntrada(EJEMPLOS_TRANSPORTE.managua);
}

function limpiarCampos() {
  const inputs = document.querySelectorAll("#contenedorTablaEntrada input.input-numero");
  inputs.forEach((inp) => {
    inp.value = "";
  });
  ocultarError();
  actualizarResumenBalancePrevio();
  document.getElementById("seccionResultados").classList.add("oculto");
  estadoAplicacion.ultimoResumenContexto = null;
  guardarEstadoLocalStorage();
}

function reResolverSiVisible() {
  const seccion = document.getElementById("seccionResultados");
  if (seccion && !seccion.classList.contains("oculto")) {
    ejecutarResolucion();
  } else {
    guardarEstadoLocalStorage();
  }
}

/* ---------- 9. DATOS ACADÉMICOS, PERSISTENCIA (LOCALSTORAGE) Y EXPORTACIONES ---------- */

function inicializarDatosEstudiante() {
  const nodos = {
    headerNombreEstudiante: NOMBRE_ESTUDIANTE,
    headerGrupoEstudiante: GRUPO_ESTUDIANTE,
    footerNombreEstudiante: NOMBRE_ESTUDIANTE,
    footerGrupoEstudiante: GRUPO_ESTUDIANTE
  };
  for (const [id, valor] of Object.entries(nodos)) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }
}

function mostrarIndicadorGuardado(texto = "Avance guardado automáticamente") {
  const el = document.getElementById("estadoGuardado");
  if (!el) return;
  const hora = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  el.textContent = `${texto} (${hora})`;
}

function recopilarEstadoPersistible() {
  const tabla = capturarValoresActualesTabla();
  if (!tabla) return null;
  const seccionResultados = document.getElementById("seccionResultados");
  const resultadosVisibles = Boolean(seccionResultados && !seccionResultados.classList.contains("oculto"));

  return {
    version: 1,
    timestamp: Date.now(),
    objetivo: obtenerObjetivoSeleccionado(),
    modo: obtenerModoSeleccionado(),
    metodo: obtenerMetodoSeleccionado(),
    mostrarComparativa: debeMostrarComparativa(),
    ejemploSeleccionado: document.getElementById("selectorEjemplo")?.value || "managua",
    filas: parseInt(document.getElementById("cantidadOrigenes")?.value, 10) || tabla.ofertas.length,
    columnas: parseInt(document.getElementById("cantidadDestinos")?.value, 10) || tabla.demandas.length,
    tabla,
    resultadosVisibles,
    indicePasoActual: estadoAplicacion.indicePasoActual,
    verTodosLosPasos: estadoAplicacion.verTodosLosPasos,
    varianteDiccionario: estadoAplicacion.varianteDiccionario
  };
}

function guardarEstadoLocalStorage() {
  if (typeof localStorage === "undefined" || typeof document === "undefined") return;
  try {
    const estado = recopilarEstadoPersistible();
    if (!estado) return;
    localStorage.setItem(CLAVE_LOCAL_STORAGE, JSON.stringify(estado));
    mostrarIndicadorGuardado();
  } catch {
    // Ignorar errores de cuota o modo privado en Safari/iOS
  }
}

function cargarEstadoLocalStorage() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CLAVE_LOCAL_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.tabla) return null;
    return parsed;
  } catch {
    return null;
  }
}

function aplicarEstadoGuardado(guardado) {
  if (!guardado) return false;

  const setRadio = (name, val) => {
    if (!val) return;
    const r = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (r) r.checked = true;
  };

  setRadio("objetivoModelo", guardado.objetivo);
  setRadio("modoResolucion", guardado.modo);
  setRadio("metodoResolucion", guardado.metodo);

  const checkComp = document.getElementById("checkComparativa");
  if (checkComp && typeof guardado.mostrarComparativa === "boolean") {
    checkComp.checked = guardado.mostrarComparativa;
  }

  const selector = document.getElementById("selectorEjemplo");
  if (selector && guardado.ejemploSeleccionado) {
    selector.value = guardado.ejemploSeleccionado;
  }

  const inputFilas = document.getElementById("cantidadOrigenes");
  const inputCols = document.getElementById("cantidadDestinos");
  if (inputFilas && guardado.filas) inputFilas.value = guardado.filas;
  if (inputCols && guardado.columnas) inputCols.value = guardado.columnas;

  generarTablaEntrada({
    objetivo: guardado.objetivo,
    nombresOrigenes: guardado.tabla.nombresOrigenes || [],
    nombresDestinos: guardado.tabla.nombresDestinos || [],
    costos: guardado.tabla.costos || [],
    prohibidas: guardado.tabla.prohibidas || [],
    ofertas: guardado.tabla.ofertas || [],
    demandas: guardado.tabla.demandas || []
  });

  if (typeof guardado.varianteDiccionario === "number") {
    estadoAplicacion.varianteDiccionario = guardado.varianteDiccionario;
  }

  if (guardado.resultadosVisibles) {
    estadoAplicacion._restaurandoDesdeStorage = true;
    try {
      ejecutarResolucion();
      if (typeof guardado.verTodosLosPasos === "boolean") {
        estadoAplicacion.verTodosLosPasos = guardado.verTodosLosPasos;
      }
      if (typeof guardado.indicePasoActual === "number") {
        estadoAplicacion.indicePasoActual = guardado.indicePasoActual;
      }
      if (obtenerModoSeleccionado() === "guiado") {
        renderizarContenedorPasos();
      }
    } finally {
      estadoAplicacion._restaurandoDesdeStorage = false;
    }
  }

  mostrarIndicadorGuardado("Sesión restaurada");
  return true;
}

/* ---------- EXPORTACIÓN A EXCEL (.XLSX) SIN DEPENDENCIAS EXTERNAS ---------- */

function limpiarTextoXml(texto) {
  return String(texto ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function indiceAColumnaExcel(idx) {
  let n = idx + 1;
  let col = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function construirHojaXml(filas, estilosPorFila = {}) {
  const anchos = [];
  for (const fila of filas) {
    for (let c = 0; c < fila.length; c++) {
      const len = String(fila[c] ?? "").length;
      anchos[c] = Math.min(60, Math.max(anchos[c] || 10, len + 3));
    }
  }

  const colsXml = anchos.length
    ? `<cols>${anchos
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  let rowsXml = "";
  for (let r = 0; r < filas.length; r++) {
    const fila = filas[r];
    const estilo = estilosPorFila[r] ?? 0;
    let cellsXml = "";
    for (let c = 0; c < fila.length; c++) {
      const val = fila[c];
      if (val === null || val === undefined || val === "") continue;
      const ref = `${indiceAColumnaExcel(c)}${r + 1}`;
      const sAttr = estilo ? ` s="${estilo}"` : "";
      if (typeof val === "number" && Number.isFinite(val)) {
        cellsXml += `<c r="${ref}"${sAttr} t="n"><v>${val}</v></c>`;
      } else {
        cellsXml += `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${limpiarTextoXml(val)}</t></is></c>`;
      }
    }
    rowsXml += `<row r="${r + 1}">${cellsXml}</row>`;
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    colsXml +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`
  );
}

const TABLA_CRC32 = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

function calcularCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = TABLA_CRC32[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crearZipAlmacenado(archivos) {
  const encoder = new TextEncoder();
  const entradas = archivos.map((a) => ({
    nombreBytes: encoder.encode(a.nombre),
    datosBytes: typeof a.contenido === "string" ? encoder.encode(a.contenido) : a.contenido
  }));

  const partesLocales = [];
  const partesCentrales = [];
  let offset = 0;

  for (const e of entradas) {
    const crc = calcularCrc32(e.datosBytes);
    const tam = e.datosBytes.length;
    const nomLen = e.nombreBytes.length;

    const localHeader = new Uint8Array(30 + nomLen);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, tam, true);
    lv.setUint32(22, tam, true);
    lv.setUint16(26, nomLen, true);
    lv.setUint16(28, 0, true);
    localHeader.set(e.nombreBytes, 30);

    partesLocales.push(localHeader, e.datosBytes);

    const centralHeader = new Uint8Array(46 + nomLen);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, tam, true);
    cv.setUint32(24, tam, true);
    cv.setUint16(28, nomLen, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(e.nombreBytes, 46);

    partesCentrales.push(centralHeader);
    offset += localHeader.length + tam;
  }

  const centralSize = partesCentrales.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entradas.length, true);
  ev.setUint16(10, entradas.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen = offset + centralSize + eocd.length;
  const resultado = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of [...partesLocales, ...partesCentrales, eocd]) {
    resultado.set(p, pos);
    pos += p.length;
  }
  return resultado;
}

function construirXlsxBytes(hojas) {
  const archivos = [];
  const overrides = hojas
    .map(
      (_, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  archivos.push({
    nombre: "[Content_Types].xml",
    contenido:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      overrides +
      `</Types>`
  });

  archivos.push({
    nombre: "_rels/.rels",
    contenido:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  });

  archivos.push({
    nombre: "xl/styles.xml",
    contenido:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="3">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="13"/><color rgb="FF4A1C40"/><name val="Calibri"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF6B2D5C"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `</cellXfs>` +
      `</styleSheet>`
  });

  const sheetsXml = hojas
    .map(
      (h, idx) =>
        `<sheet name="${limpiarTextoXml(h.nombre.slice(0, 31))}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join("");

  archivos.push({
    nombre: "xl/workbook.xml",
    contenido:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetsXml}</sheets>` +
      `</workbook>`
  });

  const relsXml =
    hojas
      .map(
        (_, idx) =>
          `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  archivos.push({
    nombre: "xl/_rels/workbook.xml.rels",
    contenido:
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsXml}</Relationships>`
  });

  hojas.forEach((h, idx) => {
    archivos.push({
      nombre: `xl/worksheets/sheet${idx + 1}.xml`,
      contenido: construirHojaXml(h.filas, h.estilos || {})
    });
  });

  return crearZipAlmacenado(archivos);
}

function exportarResultadosExcel() {
  const ctx = estadoAplicacion.ultimoResumenContexto;
  if (!ctx) return;

  const { modelo, estadoSolucion, invariantes, comparativa, pasos, modo, metodo, balanceadoOriginalmente } = ctx;
  const { asignacion } = estadoSolucion;
  const valorTotal = calcularValorRealTotal(asignacion, modelo.costos, modelo.prohibidas);
  const formulacion = construirFormulacion(modelo, metodo);
  const narrativa = construirResumenNarrativoDinamico({
    modelo,
    estadoSolucion,
    invariantes,
    pasos,
    metodo,
    varianteIdx: estadoAplicacion.varianteDiccionario
  });
  const fechaStr = new Date().toLocaleString("es-MX");

  // Hoja 1: Resumen
  const filasResumen = [
    ["Modelos de Transporte - Reporte de Resultados"],
    ["Estudiante", NOMBRE_ESTUDIANTE],
    ["Grupo", GRUPO_ESTUDIANTE],
    ["Fecha de exportación", fechaStr],
    [],
    ["Parámetro", "Valor"],
    ["Objetivo", modelo.objetivo === "maximizar" ? "Maximizar Utilidades (Max Z)" : "Minimizar Costos (Min Z)"],
    ["Método", metodo],
    ["Modo", modo === "guiado" ? "Guiado / Paso a Paso" : "Global / Directo"],
    ["Balanceado originalmente", balanceadoOriginalmente ? "Sí" : "No (se agregó nodo ficticio)"],
    ["Estado de Factibilidad", invariantes.infactiblePorProhibidas ? "Infactible (usa ruta M)" : invariantes.esValida ? "Solución básica factible" : "Con incidencias"],
    [modelo.objetivo === "maximizar" ? "Ganancia Total (Z)" : "Costo Total (Z)", invariantes.infactiblePorProhibidas ? "Infactible" : valorTotal],
    [],
    ["Conceptos y Fórmulas", "Detalle"],
    ["Condición de Balance", formulacion.balance],
    ["Función Objetivo", formulacion.objetivo],
    ["Restricciones", formulacion.restricciones],
    ["Regla del Método", formulacion.metodo],
    ["Suma Total", narrativa.formulaSumaTotal],
    [],
    ["Explicación Detallada"]
  ];
  narrativa.parrafos.forEach((p) => filasResumen.push([p]));

  // Hoja 2: Matriz Final
  const filasMatriz = [
    ["Matriz Final de Asignación (Unidades x_ij y Valor Unitario c_ij)"],
    ["Origen \\ Destino", ...modelo.nombresDestinos, "Oferta"]
  ];
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    const row = [modelo.nombresOrigenes[i]];
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const cTexto = modelo.prohibidas[i][j] ? "M" : formatearNumero(modelo.costos[i][j]);
      row.push(`${formatearNumero(asignacion[i][j])} (c=${cTexto})`);
    }
    row.push(modelo.ofertas[i]);
    filasMatriz.push(row);
  }
  const totalOferta = redondearSiCero(modelo.ofertas.reduce((a, b) => a + b, 0));
  filasMatriz.push(["Demanda", ...modelo.demandas, totalOferta]);
  filasMatriz.push([]);
  filasMatriz.push(["Matriz Numérica de Unidades Asignadas (x_ij)"]);
  filasMatriz.push(["Origen \\ Destino", ...modelo.nombresDestinos, "Oferta"]);
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    filasMatriz.push([modelo.nombresOrigenes[i], ...asignacion[i].map((v) => redondearSiCero(v)), modelo.ofertas[i]]);
  }
  filasMatriz.push(["Demanda", ...modelo.demandas, totalOferta]);

  // Hoja 3: Variables x_ij
  const filasVars = [
    ["Detalle de Variables de Decisión (x_ij)"],
    ["Variable", "Origen", "Destino", "Unidades (x_ij)", "Valor Unitario (c_ij)", "Subtotal", "Estado"]
  ];
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const val = redondearSiCero(asignacion[i][j]);
      const esProh = modelo.prohibidas[i][j];
      const esBas = estadoSolucion.basicas?.[i]?.[j] ?? false;
      const estadoVar = esProh ? (val > EPS ? "Ruta Prohibida (M)" : "Prohibida (M)") : val > EPS ? "Activa" : esBas ? "Básica (ε)" : "Cero";
      filasVars.push([
        `x_${i + 1}${j + 1}`,
        modelo.nombresOrigenes[i],
        modelo.nombresDestinos[j],
        val,
        esProh ? "M" : modelo.costos[i][j],
        esProh ? "M" : redondearSiCero(val * modelo.costos[i][j]),
        estadoVar
      ]);
    }
  }
  filasVars.push(["TOTAL", "", "", "", "", invariantes.infactiblePorProhibidas ? "Infactible" : valorTotal, ""]);

  const hojas = [
    { nombre: "Resumen", filas: filasResumen, estilos: { 0: 2, 5: 1, 13: 1, 20: 1 } },
    { nombre: "Matriz Final", filas: filasMatriz, estilos: { 0: 2, 1: 1, [modelo.nombresOrigenes.length + 4]: 2, [modelo.nombresOrigenes.length + 5]: 1 } },
    { nombre: "Variables", filas: filasVars, estilos: { 0: 2, 1: 1, [filasVars.length - 1]: 1 } }
  ];

  // Hoja 4: Comparativa (si existe)
  if (comparativa && comparativa.resultados?.length) {
    const filasComp = [
      ["Comparativa de Eficiencia entre Métodos"],
      ["Método", "Valor Total (Z)", "Iteraciones MODI", "Brecha vs. Óptimo", "Estado"]
    ];
    comparativa.resultados.forEach((r) => {
      const esOpt = !r.infactible && comparativa.mejorValor !== null && Math.abs(r.valorTotal - comparativa.mejorValor) <= EPS;
      const dif = r.infactible || comparativa.mejorValor === null ? "-" : redondearSiCero(Math.abs(r.valorTotal - comparativa.mejorValor));
      filasComp.push([
        r.nombre,
        r.infactible ? "Infactible" : r.valorTotal,
        r.iteracionesMODI,
        dif,
        r.infactible ? "Infactible" : esOpt ? "Óptimo" : "Factible"
      ]);
    });
    hojas.push({ nombre: "Comparativa", filas: filasComp, estilos: { 0: 2, 1: 1 } });
  }

  // Hoja 5: Paso a Paso (si hay pasos)
  if (pasos && pasos.length > 0) {
    const filasPasos = [
      ["Desglose Paso a Paso"],
      ["Paso #", "Fase", "Título", "Explicación", "Fórmula", "Acumulado"]
    ];
    pasos.forEach((p) => {
      filasPasos.push([
        p.numero,
        p.fase,
        p.titulo,
        p.explicacion,
        p.formula || "",
        p.costoAcumulado !== null && p.costoAcumulado !== undefined ? p.costoAcumulado : ""
      ]);
    });
    hojas.push({ nombre: "Paso a Paso", filas: filasPasos, estilos: { 0: 2, 1: 1 } });
  }

  const bytes = construirXlsxBytes(hojas);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const limpioNombre = NOMBRE_ESTUDIANTE.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const limpioGrupo = GRUPO_ESTUDIANTE.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const fechaArchivo = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `Transporte_${limpioNombre}_${limpioGrupo}_${fechaArchivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- EXPORTACIÓN COMPLETA Y ORDENADA A PDF (MULTI-DISPOSITIVO / iOS) ---------- */

function crearTablaPdfHtml(modelo, asignacion) {
  const colsTotales = modelo.nombresDestinos.length + 2;
  const claseCompacta = colsTotales >= 7 ? " pdf-tabla-compacta" : "";
  let html = `<table class="pdf-tabla${claseCompacta}"><thead><tr><th>Origen \\ Destino</th>`;
  for (const dest of modelo.nombresDestinos) {
    html += `<th>${escaparTexto(dest)}</th>`;
  }
  html += `<th>Oferta</th></tr></thead><tbody>`;

  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    html += `<tr><th>${escaparTexto(modelo.nombresOrigenes[i])}</th>`;
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const val = asignacion[i][j];
      const esProh = modelo.prohibidas[i][j];
      const cls = esProh ? "pdf-celda-prohibida" : val > EPS ? "pdf-celda-activa" : "";
      const cTxt = esProh ? "M" : formatearNumero(modelo.costos[i][j]);
      html += `<td class="${cls}"><strong>${formatearNumero(val)}</strong><br/><small>(${cTxt})</small></td>`;
    }
    html += `<th>${formatearNumero(modelo.ofertas[i])}</th></tr>`;
  }

  const total = redondearSiCero(modelo.ofertas.reduce((a, b) => a + b, 0));
  html += `<tr><th>Demanda</th>`;
  for (const d of modelo.demandas) {
    html += `<th>${formatearNumero(d)}</th>`;
  }
  html += `<th>${formatearNumero(total)}</th></tr></tbody></table>`;
  return html;
}

function construirReportePdfHtml(ctx) {
  const { modelo, estadoSolucion, invariantes, comparativa, pasos, modo, metodo, balanceadoOriginalmente } = ctx;
  const { asignacion } = estadoSolucion;
  const fecha = new Date().toLocaleString("es-MX");
  const formulacion = construirFormulacion(modelo, metodo);
  const valorTotal = calcularValorRealTotal(asignacion, modelo.costos, modelo.prohibidas);
  const etiquetaTotal = modelo.objetivo === "maximizar" ? "Ganancia Total Resultante" : "Costo Total Resultante";
  const etiquetaUnit = modelo.objetivo === "maximizar" ? "utilidad" : "costo";
  const narrativa = construirResumenNarrativoDinamico({
    modelo,
    estadoSolucion,
    invariantes,
    pasos,
    metodo,
    varianteIdx: estadoAplicacion.varianteDiccionario
  });

  let html = `
    <div class="pdf-encabezado">
      <h1>Modelos de Transporte — Reporte Completo de Solución</h1>
      <p><strong>Estudiante:</strong> ${escaparTexto(NOMBRE_ESTUDIANTE)} &nbsp;|&nbsp; <strong>Grupo:</strong> ${escaparTexto(GRUPO_ESTUDIANTE)}</p>
      <p><strong>Objetivo:</strong> ${modelo.objetivo === "maximizar" ? "Maximizar Utilidades (Max Z)" : "Minimizar Costos (Min Z)"} &nbsp;|&nbsp; <strong>Método:</strong> ${escaparTexto(metodo)} &nbsp;|&nbsp; <strong>Modo:</strong> ${modo === "guiado" ? "Guiado" : "Global"} &nbsp;|&nbsp; <strong>Fecha:</strong> ${escaparTexto(fecha)}</p>
    </div>

    <div class="pdf-bloque">
      <h2>1. Conceptos y Fórmulas Aplicadas</h2>
      <div class="pdf-formula-item"><strong>Condición de Balance</strong><span>${escaparTexto(formulacion.balance)}</span></div>
      <div class="pdf-formula-item"><strong>Función Objetivo</strong><span>${escaparTexto(formulacion.objetivo)}</span></div>
      <div class="pdf-formula-item"><strong>Restricciones de Oferta y Demanda</strong><span>${escaparTexto(formulacion.restricciones)}</span></div>
      <div class="pdf-formula-item"><strong>Regla del Método Seleccionado</strong><span>${escaparTexto(formulacion.metodo)}</span></div>
    </div>

    <div class="pdf-bloque">
      <h2>2. Resumen de la Solución</h2>
      <p><strong>${etiquetaTotal}:</strong> ${invariantes.infactiblePorProhibidas ? "Infactible (usa ruta M)" : formatearNumero(valorTotal)}</p>
      <div class="pdf-alerta">${
        invariantes.infactiblePorProhibidas
          ? "El modelo es infactible bajo las restricciones de rutas prohibidas (usa ruta M)."
          : invariantes.esValida
          ? "Solución básica factible verificada (ofertas, demandas y condición m + n - 1 cumplidas)."
          : `Incidencias de verificación: ${escaparTexto(invariantes.incidencias.join(" | "))}`
      }</div>
      ${
        balanceadoOriginalmente
          ? ""
          : `<div class="pdf-alerta">Nota: El modelo fue balanceado automáticamente agregando un nodo ficticio con valor 0.</div>`
      }
      <ul class="pdf-lista">
  `;

  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      if (asignacion[i][j] > EPS) {
        if (modelo.prohibidas[i][j]) {
          html += `<li><strong>${escaparTexto(modelo.nombresOrigenes[i])} &rarr; ${escaparTexto(modelo.nombresDestinos[j])}</strong>: ${formatearNumero(asignacion[i][j])} u. en Ruta Prohibida (M)</li>`;
        } else {
          const sub = redondearSiCero(asignacion[i][j] * modelo.costos[i][j]);
          html += `<li><strong>${escaparTexto(modelo.nombresOrigenes[i])} &rarr; ${escaparTexto(modelo.nombresDestinos[j])}</strong>: ${formatearNumero(asignacion[i][j])} u. &times; ${etiquetaUnit} ${formatearNumero(modelo.costos[i][j])} = <strong>${formatearNumero(sub)}</strong></li>`;
        }
      }
    }
  }
  html += `</ul></div>`;

  if (comparativa && comparativa.resultados?.length) {
    html += `
      <div class="pdf-bloque">
        <h2>3. Comparativa de Eficiencia entre Métodos</h2>
        <table class="pdf-tabla">
          <thead><tr><th>Método</th><th>Valor Total (Z)</th><th>Iter. MODI</th><th>Brecha vs. Óptimo</th><th>Estado</th></tr></thead>
          <tbody>
    `;
    for (const r of comparativa.resultados) {
      const esOpt = !r.infactible && comparativa.mejorValor !== null && Math.abs(r.valorTotal - comparativa.mejorValor) <= EPS;
      const dif = r.infactible || comparativa.mejorValor === null ? "-" : formatearNumero(Math.abs(r.valorTotal - comparativa.mejorValor));
      html += `<tr><td>${escaparTexto(r.nombre)}</td><td>${r.infactible ? "Infactible" : formatearNumero(r.valorTotal)}</td><td>${r.iteracionesMODI}</td><td>${dif}</td><td>${r.infactible ? "Infactible" : esOpt ? "Óptimo" : "Factible"}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }

  html += `
    <div class="pdf-bloque">
      <h2>Tabla Final de Asignación</h2>
      ${crearTablaPdfHtml(modelo, asignacion)}
    </div>
  `;

  if (modo === "guiado" && pasos && pasos.length > 0) {
    const etiqAcum = modelo.objetivo === "maximizar" ? "Ganancia acumulada" : "Costo acumulado";
    html += `<div class="pdf-bloque"><h2>Desglose Paso a Paso (${pasos.length} pasos)</h2>`;
    for (const paso of pasos) {
      html += `
        <div class="pdf-paso">
          <div class="pdf-paso-cabecera">
            <span>Paso ${paso.numero}: ${escaparTexto(paso.titulo)}</span>
            <span class="pdf-paso-fase">${escaparTexto(paso.fase)}</span>
          </div>
          <p>${escaparTexto(paso.explicacion)}</p>
          ${paso.formula ? `<p class="pdf-formula-mono">${escaparTexto(paso.formula)}</p>` : ""}
          ${
            paso.costoAcumulado !== null && paso.costoAcumulado !== undefined
              ? `<p><strong>${etiqAcum}:</strong> ${formatearNumero(paso.costoAcumulado)}</p>`
              : ""
          }
          ${paso.asignacion ? crearTablaPdfHtml(modelo, paso.asignacion) : ""}
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `
    <div class="pdf-bloque">
      <h2>Variables de Decisión (xᵢⱼ) y Explicación Final</h2>
      <table class="pdf-tabla pdf-tabla-compacta">
        <thead><tr><th>Variable</th><th>Ruta</th><th>Unidades (xᵢⱼ)</th><th>Unitario / Subtotal</th><th>Estado</th></tr></thead>
        <tbody>
  `;
  for (let i = 0; i < modelo.nombresOrigenes.length; i++) {
    for (let j = 0; j < modelo.nombresDestinos.length; j++) {
      const val = asignacion[i][j];
      const esProh = modelo.prohibidas[i][j];
      const esBas = estadoSolucion.basicas?.[i]?.[j] ?? false;
      const sub = esProh ? "M" : formatearNumero(redondearSiCero(val * modelo.costos[i][j]));
      const est = esProh ? "Prohibida (M)" : val > EPS ? "Activa" : esBas ? "Básica (ε)" : "Cero";
      const cls = val > EPS ? "pdf-celda-activa" : "";
      html += `<tr class="${cls}"><td>x<sub>${i + 1}${j + 1}</sub></td><td>${escaparTexto(modelo.nombresOrigenes[i])} &rarr; ${escaparTexto(modelo.nombresDestinos[j])}</td><td>${formatearNumero(val)}</td><td>${esProh ? "M" : `${formatearNumero(modelo.costos[i][j])} / ${sub}`}</td><td>${est}</td></tr>`;
    }
  }
  html += `
        </tbody>
      </table>
      <h3>${escaparTexto(narrativa.objetivoTexto)}</h3>
      <p class="pdf-formula-mono">${escaparTexto(narrativa.formulaSumaTotal)}</p>
      <h3>Explicación Detallada del Procedimiento</h3>
  `;
  for (const p of narrativa.parrafos) {
    html += `<p class="pdf-parrafo">${escaparTexto(p)}</p>`;
  }
  html += `</div>`;

  return html;
}

function prepararReportePdfSiExiste() {
  const ctx = estadoAplicacion.ultimoResumenContexto;
  const cont = document.getElementById("reportePdfImpresion");
  if (!ctx || !cont) return false;
  cont.innerHTML = construirReportePdfHtml(ctx);
  return true;
}

function exportarResultadosPDF() {
  if (!prepararReportePdfSiExiste()) return;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  } else {
    window.print();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    inicializarDatosEstudiante();

    const guardado = cargarEstadoLocalStorage();
    if (!aplicarEstadoGuardado(guardado)) {
      generarTablaEntrada();
      guardarEstadoLocalStorage();
    }

    document.getElementById("botonGenerarTabla").addEventListener("click", () => {
      generarTablaEntrada();
      guardarEstadoLocalStorage();
    });
    document.getElementById("botonCargarEjemplo").addEventListener("click", cargarEjemploSeleccionado);
    document.getElementById("botonResolver").addEventListener("click", ejecutarResolucion);
    document.getElementById("botonLimpiar").addEventListener("click", limpiarCampos);
    document.getElementById("btnExportarExcel")?.addEventListener("click", exportarResultadosExcel);
    document.getElementById("btnExportarPDF")?.addEventListener("click", exportarResultadosPDF);

    document.getElementById("contenedorTablaEntrada").addEventListener("input", () => {
      actualizarResumenBalancePrevio();
      guardarEstadoLocalStorage();
    });

    document.getElementById("selectorEjemplo")?.addEventListener("change", guardarEstadoLocalStorage);

    const controlesReactivos = document.querySelectorAll(
      'input[name="objetivoModelo"], input[name="modoResolucion"], input[name="metodoResolucion"], #checkComparativa'
    );
    controlesReactivos.forEach((ctrl) => {
      ctrl.addEventListener("change", reResolverSiVisible);
    });

    window.addEventListener("beforeprint", prepararReportePdfSiExiste);
    window.addEventListener("pagehide", guardarEstadoLocalStorage);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        guardarEstadoLocalStorage();
      }
    });

    document.addEventListener("keydown", (ev) => {
      const etiqueta = document.activeElement?.tagName;
      if (etiqueta === "INPUT" || etiqueta === "TEXTAREA" || etiqueta === "SELECT") return;
      if (estadoAplicacion.verTodosLosPasos || estadoAplicacion.ultimosPasosRender.length === 0) return;

      if (ev.key === "ArrowLeft" && estadoAplicacion.indicePasoActual > 0) {
        ev.preventDefault();
        estadoAplicacion.indicePasoActual--;
        renderizarContenedorPasos();
        guardarEstadoLocalStorage();
      } else if (
        ev.key === "ArrowRight" &&
        estadoAplicacion.indicePasoActual < estadoAplicacion.ultimosPasosRender.length - 1
      ) {
        ev.preventDefault();
        estadoAplicacion.indicePasoActual++;
        renderizarContenedorPasos();
        guardarEstadoLocalStorage();
      }
    });
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    NOMBRE_ESTUDIANTE,
    GRUPO_ESTUDIANTE,
    balancearModelo,
    resolverEsquinaNoroeste,
    resolverCostoMenor,
    resolverAproximacionVogel,
    optimizarConMODI,
    ejecutarEstrategia,
    verificarInvariantes,
    generarComparativaMetodos,
    calcularValorRealTotal,
    parsearCeldaMatriz,
    validarModelo,
    EJEMPLOS_TRANSPORTE,
    DICCIONARIO_NARRATIVO,
    construirResumenNarrativoDinamico,
    construirXlsxBytes
  };
}
