# Guía Completa de Modelos de Transporte: Conceptos, Fórmulas y Resolución Manual Paso a Paso

Esta guía explica la teoría matemática, las fórmulas exactas de Programación Lineal y el procedimiento manual paso a paso para cada caso implementado en el sistema. Sirve tanto para aprender a resolver cualquier ejercicio a mano como para verificar que el motor de cálculo en `app.js` aplica correctamente todas las reglas.

---

## 1. Formulación Matemática (Programación Lineal)

Un **Modelo de Transporte** busca determinar cuántas unidades $x_{ij}$ enviar desde $m$ orígenes ($i = 1, \dots, m$) hacia $n$ destinos ($j = 1, \dots, n$) para optimizar un objetivo total $Z$, respetando la capacidad disponible en cada origen y la cantidad requerida en cada destino.

### Variables y Parámetros
- $x_{ij}$: Cantidad de unidades enviadas del origen $i$ al destino $j$ (variable de decisión).
- $c_{ij}$: Costo unitario (o utilidad unitaria $p_{ij}$ en maximización) de enviar una unidad de $i$ a $j$.
- $a_i$: Oferta o capacidad disponible en el origen $i$.
- $b_j$: Demanda requerida en el destino $j$.

### Modelo General
**Función Objetivo:**
$$\text{Minimizar (o Maximizar) } Z = \sum_{i=1}^{m} \sum_{j=1}^{n} c_{ij} x_{ij}$$

**Sujeto a las restricciones:**
1. **Oferta (cada origen entrega exactamente su disponibilidad):**
   $$\sum_{j=1}^{n} x_{ij} = a_i \quad \text{para } i = 1, 2, \dots, m$$
2. **Demanda (cada destino recibe exactamente lo que pide):**
   $$\sum_{i=1}^{m} x_{ij} = b_j \quad \text{para } j = 1, 2, \dots, n$$
3. **No negatividad:**
   $$x_{ij} \ge 0 \quad \text{para todo } i, j$$

---

## 2. Reglas de Preparación y Casos Especiales

### A. Condición de Balance ($\sum a_i = \sum b_j$)
Para que el modelo tenga solución factible, la oferta total debe igualar a la demanda total:
$$\sum_{i=1}^{m} a_i = \sum_{j=1}^{n} b_j$$

- **Si $\sum a_i > \sum b_j$ (sobra oferta):** Se agrega una columna llamada **Destino Ficticio** con demanda $b_{\text{fic}} = \sum a_i - \sum b_j$ y costo unitario $0$ en todas sus celdas. Representa inventario que queda sin enviar en los orígenes.
- **Si $\sum b_j > \sum a_i$ (falta oferta):** Se agrega una fila llamada **Origen Ficticio** con oferta $a_{\text{fic}} = \sum b_j - \sum a_i$ y costo unitario $0$ en todas sus celdas. Representa demanda insatisfecha.

### B. Maximización de Utilidades ($\max Z$)
Los algoritmos clásicos (Vogel, Costo Mínimo, MODI) están diseñados para **minimizar**. Para resolver un problema de **maximización** con utilidad unitaria $p_{ij}$:
1. Encuentra el valor máximo de utilidad en toda la matriz permitida:
   $$V_{\max} = \max(p_{ij})$$
2. Convierte cada celda permitida en una matriz equivalente de **costo de oportunidad**:
   $$c'_{ij} = V_{\max} - p_{ij}$$
   *(Importante: Si existe un nodo ficticio con utilidad real $0$, su costo equivalente será $c'_{\text{fic}} = V_{\max} - 0 = V_{\max}$).*
3. Resuelve el problema minimizando $c'_{ij}$ con los métodos normales.
4. Al obtener las asignaciones finales $x_{ij}$, calcula la ganancia real multiplicando por los valores **originales** $p_{ij}$:
   $$Z_{\max} = \sum_{i=1}^{m} \sum_{j=1}^{n} p_{ij} x_{ij}$$

### C. Rutas Prohibidas o Bloqueadas ($M$)
Cuando no es posible enviar mercancía por una ruta $(i, j)$:
1. Se le asigna un costo penalizado muy grande $M$ ($M \gg c_{ij}$) en la matriz interna de cálculo para que Costo Mínimo, Vogel y MODI la eviten.
2. **Criterio de infactibilidad:** Si al finalizar la optimización con MODI alguna ruta marcada con $M$ queda con asignación positiva ($x_{ij} > 0$), significa que **el problema es infactible** (no existe forma de cubrir ofertas y demandas sin usar rutas prohibidas).

### D. Degeneración y la Regla $m + n - 1$
En una tabla balanceada de $m$ filas y $n$ columnas, una **solución básica factible** debe tener exactamente:
$$\text{Celdas básicas} = m + n - 1$$
- **¿Cuándo ocurre degeneración?** Cuando en un paso de asignación se agotan al mismo tiempo una fila y una columna ($a_i = b_j$). Al tachar ambas, el número total de celdas asignadas queda **menor a $m + n - 1$**.
- **¿Por qué importa?** Si hay menos de $m + n - 1$ celdas básicas, el sistema de ecuaciones $u_i + v_j = c_{ij}$ de MODI queda incompleto y no se pueden calcular todos los multiplicadores.
- **Cómo se corrige a mano:** Se coloca una asignación conceptual $\varepsilon \approx 0$ en una celda vacía **independiente** (es decir, que **no forme ningún ciclo cerrado** con las celdas básicas actuales) hasta completar $m + n - 1$ básicas.

### E. Soluciones Óptimas Alternativas
Al llegar al óptimo en MODI ($\Delta_{ij} \ge 0$ para todas las celdas vacías), si alguna celda vacía permitida tiene exactamente:
$$\Delta_{ij} = 0$$
entonces **existen múltiples planes de envío diferentes** que producen exactamente el mismo costo mínimo (o ganancia máxima) $Z$.

---

## 3. Métodos de Solución Inicial (Paso a Paso Manual)

### Método 1: Esquina Noroeste
Es un método puramente posicional (ignora los costos $c_{ij}$):
1. Comienza en la celda superior izquierda $(1, 1)$.
2. Asigna $x_{ij} = \min(a_i, b_j)$ usando la oferta y demanda disponibles.
3. Resta $x_{ij}$ a la oferta de la fila $i$ y a la demanda de la columna $j$.
4. Si se agota la fila ($a_i = 0$), baja a la fila $i+1$. Si se agota la columna ($b_j = 0$), avanza a la derecha a $j+1$. (Si ambas llegan a $0$ a la vez, avanza en ambas y recuerda revisar degeneración al final).
5. Repite hasta agotar toda la oferta y demanda.

### Método 2: Costo Mínimo
Es un método voraz basado en costos:
1. Busca en las celdas activas (filas y columnas no agotadas) la celda con el **menor costo unitario $c_{ij}$** (en empate, prefiere la que permita asignar mayor cantidad $\min(a_i, b_j)$).
2. Asigna $x_{ij} = \min(a_i, b_j)$.
3. Tacha la fila o columna que llegue a $0$.
4. Repite hasta completar todas las asignaciones.

### Método 3: Aproximación de Vogel (VAM)
Considera el **costo de oportunidad (penalización)** por no elegir la mejor ruta:
1. Para cada fila activa y cada columna activa, calcula su **penalización**:
   $$\text{Penalización} = (\text{2do menor costo}) - (\text{1er menor costo})$$
   *(Si solo queda 1 fila o 1 columna activa, todas las asignaciones restantes son forzadas y se completan directamente).*
2. Elige la fila o columna con la **mayor penalización** (en empate, elige la que tenga el menor costo unitario disponible; si persiste, la de mayor cantidad asignable).
3. Dentro de esa línea ganadora, asigna $x_{ij} = \min(a_i, b_j)$ en su celda de **menor costo**.
4. Tacha la fila o columna satisfecha y recalcula penalizaciones. Repite hasta terminar.

---

## 4. Optimización Exacta: Método MODI ($u_i + v_j$)

Una solución inicial cumple las restricciones, pero **no garantiza ser óptima**. MODI evalúa si existe algún intercambio que mejore $Z$:

1. **Verificar básicas:** Confirmar que hay $m + n - 1$ celdas básicas formando un árbol sin ciclos (agregar $\varepsilon \approx 0$ si faltan).
2. **Calcular multiplicadores $u_i$ y $v_j$:**
   - Asignar $u_1 = 0$.
   - Para cada **celda básica**, aplicar:
     $$u_i + v_j = c_{ij}$$
   - Despejar todos los $u_i$ y $v_j$.
3. **Evaluar celdas vacías (no básicas):**
   - Para cada celda vacía $(i, j)$, calcular su indicador de mejora:
     $$\Delta_{ij} = c_{ij} - (u_i + v_j)$$
4. **Prueba de optimalidad:**
   - Si **todos** los $\Delta_{ij} \ge 0$: **Solución óptima encontrada.** Detenerse.
   - Si hay algún $\Delta_{ij} < 0$: elegir la celda con el **$\Delta_{ij}$ más negativo** como **celda entrante**.
5. **Ciclo cerrado y pivote ($\theta$):**
   - Trazar un circuito cerrado rectangular (giros de 90 grados) que inicie y termine en la celda entrante y cuyas esquinas intermedias sean **únicamente celdas básicas**.
   - Alternar signos $(+, -, +, -, \dots)$ empezando con $(+)$ en la celda entrante.
   - Determinar la cantidad máxima a reasignar:
     $$\theta = \min \{ x_{ij} \text{ en las esquinas con signo } (-) \}$$
   - Sumar $\theta$ a las celdas $(+)$ y restar $\theta$ a las celdas $(-)$. La celda $(-)$ que alcanza $0$ sale de la base (si empatan varias en $0$, sale solo una y las demás quedan como básicas con $0$).
   - Volver al paso 1.

---

## 5. Casos Prácticos Resueltos Paso a Paso (Verificación Manual)

Estos son los 4 casos precargados en el sistema para que puedas resolverlos manualmente y comprobar cada número.

---

### Caso 1: Talleres de Managua (3x3 Balanceado, Minimización)

| Origen \ Destino | Oriental | Huembes | Israel | Oferta ($a_i$) |
| --- | :---: | :---: | :---: | :---: |
| **Taller A** | 4 | 6 | 8 | **40** |
| **Taller B** | 5 | 0 | 7 | **35** |
| **Taller C** | 6 | 5 | 4 | **25** |
| **Demanda ($b_j$)** | **30** | **40** | **30** | **100** |

1. **Balance:** $\sum a_i = 40 + 35 + 25 = 100$ y $\sum b_j = 30 + 40 + 30 = 100$. Balanceado.
2. **Solución inicial por Vogel:**
   - **Ronda 1:**
     - Penalizaciones filas: A ($6-4=2$), B ($5-0=5$), C ($5-4=1$).
     - Penalizaciones columnas: Oriental ($5-4=1$), Huembes ($5-0=5$), Israel ($7-4=3$).
     - Máxima penalización = `5` (empate entre Fila B y Columna Huembes; ambos apuntan a `(B -> Huembes)` con costo `0`).
     - Asignar $x_{B,\text{Huembes}} = \min(35, 40) = 35$. Se agota Taller B; queda demanda Huembes = `5`.
   - **Ronda 2 (quedan Filas A, C):**
     - Penalizaciones filas: A ($6-4=2$), C ($5-4=1$).
     - Penalizaciones columnas: Oriental ($6-4=2$), Huembes ($6-5=1$), Israel ($8-4=4$).
     - Máxima penalización = `4` en Columna Israel. Menor costo en Israel es `(C -> Israel) = 4`.
     - Asignar $x_{C,\text{Israel}} = \min(25, 30) = 25$. Se agota Taller C; queda demanda Israel = `5`.
   - **Ronda 3:** Solo queda Fila A activa (`40` unidades) para cubrir Oriental (`30`), Huembes (`5`) e Israel (`5`). Asignaciones forzadas:
     - $x_{A,\text{Oriental}} = 30$, $x_{A,\text{Huembes}} = 5$, $x_{A,\text{Israel}} = 5$.
3. **Verificación MODI:**
   - Básicas ($m+n-1 = 5$): `(A,O)=30`, `(A,H)=5`, `(A,I)=5`, `(B,H)=35`, `(C,I)=25`.
   - Con $u_A = 0$:
     - $v_O = 4 - 0 = 4$, $v_H = 6 - 0 = 6$, $v_I = 8 - 0 = 8$.
     - $u_B = 0 - 6 = -6$, $u_C = 4 - 8 = -4$.
   - Celdas vacías ($\Delta_{ij} = c_{ij} - (u_i + v_j)$):
     - $\Delta_{B,O} = 5 - (-6 + 4) = +7 \ge 0$
     - $\Delta_{B,I} = 7 - (-6 + 8) = +5 \ge 0$
     - $\Delta_{C,O} = 6 - (-4 + 4) = +6 \ge 0$
     - $\Delta_{C,H} = 5 - (-4 + 6) = +3 \ge 0$
   - Todos los $\Delta_{ij} \ge 0$. **Solución óptima:**
     $$Z_{\min} = (30 \times 4) + (5 \times 6) + (5 \times 8) + (35 \times 0) + (25 \times 4) = 120 + 30 + 40 + 0 + 100 = \mathbf{290}$$

---

### Caso 2: Fábricas y Almacenes (3x4 Clásico, Minimización)

| Origen \ Destino | Alm. 1 | Alm. 2 | Alm. 3 | Alm. 4 | Oferta |
| --- | :---: | :---: | :---: | :---: | :---: |
| **Fábrica 1** | 19 | 30 | 50 | 10 | **7** |
| **Fábrica 2** | 70 | 30 | 40 | 60 | **9** |
| **Fábrica 3** | 40 | 8 | 70 | 20 | **18** |
| **Demanda** | **5** | **8** | **7** | **14** | **34** |

1. **Comparativa de inicios:**
   - **Esquina Noroeste:** $x_{11}=5, x_{12}=2, x_{22}=6, x_{23}=3, x_{33}=4, x_{34}=14 \implies Z = \mathbf{1015}$.
   - **Costo Mínimo:** $Z = \mathbf{814}$.
   - **Vogel (VAM):**
     - R1: F1 (`9`), F2 (`10`), F3 (`12`), C1 (`21`), C2 (`22`), C3 (`10`), C4 (`10`) -> Gana C2 (`22`) -> $x_{32}=8$.
     - R2: F1 (`9`), F2 (`20`), F3 (`20`), C1 (`21`), C3 (`10`), C4 (`10`) -> Gana C1 (`21`) -> $x_{11}=5$.
     - R3: F1 (`40`), F2 (`20`), F3 (`50`), C3 (`10`), C4 (`10`) -> Gana F3 (`50`) -> $x_{34}=10$.
     - R4: Queda C3 (`7`) y C4 (`4`), F1 (`2`) y F2 (`9`) -> $x_{14}=2$, $x_{23}=7$, $x_{24}=2$.
     - Costo inicial Vogel: $Z = 5(19) + 2(10) + 7(40) + 2(60) + 8(8) + 10(20) = \mathbf{779}$.
2. **Mejora con MODI desde Vogel ($Z = 779$):**
   - Básicas ($3+4-1 = 6$): `(1,1)=5`, `(1,4)=2`, `(2,3)=7`, `(2,4)=2`, `(3,2)=8`, `(3,4)=10`.
   - Multiplicadores ($u_1 = 0$): $v_1 = 19$, $v_4 = 10$, $u_2 = 50$, $v_3 = -10$, $u_3 = 10$, $v_2 = -2$.
   - Evaluar `(3, 2)`? No, está ocupada. Evaluar `(2, 2)`:
     $$\Delta_{22} = 30 - (u_2 + v_2) = 30 - (50 - 2) = -18 < 0$$
   - Ciclo cerrado para `(2, 2)`: `(2,2)+ -> (2,4)- -> (3,4)+ -> (3,2)-`.
   - $\theta = \min(x_{24}=2, x_{32}=8) = 2$.
   - Nueva asignación: $x_{22}=2, x_{24}=0 \text{ (sale)}, x_{34}=12, x_{32}=6$.
   - Nuevo costo: $779 - 18 \times 2 = \mathbf{743}$.
   - Al recalcular $u, v$ y $\Delta_{ij}$, todos los $\Delta_{ij} \ge 0$. **Óptimo global: $Z_{\min} = \mathbf{743}$.**

---

### Caso 3: Maximización de Utilidades con Degeneración (3x3, Maximización)

| Origen \ Destino | Bodega 1 | Bodega 2 | Bodega 3 | Oferta |
| --- | :---: | :---: | :---: | :---: |
| **Planta 1** | 8 | 5 | 6 | **120** |
| **Planta 2** | 15 | 10 | 12 | **80** |
| **Planta 3** | 3 | 9 | 10 | **80** |
| **Demanda** | **150** | **80** | **50** | **280** |

1. **Conversión a Minimización:**
   - Utilidad máxima $V_{\max} = 15$ (en Planta 2 -> Bodega 1).
   - Matriz de costo de oportunidad $c'_{ij} = 15 - p_{ij}$:
     - Planta 1: `[7, 10, 9]`
     - Planta 2: `[0, 5, 3]`
     - Planta 3: `[12, 6, 5]`
2. **Solución por Vogel sobre $c'_{ij}$:**
   - Asigna $x_{21} = 80$, $x_{32} = 80$ (agota Planta 3 y Bodega 2 a la vez), $x_{11} = 70$, $x_{13} = 50$.
3. **Degeneración ($m+n-1 = 5$):**
   - Solo hay **4** celdas con envío positivo: `(1,1)=70`, `(1,3)=50`, `(2,1)=80`, `(3,2)=80`.
   - La fila 3 y columna 2 están desconectadas del resto. Se agrega una celda básica $\varepsilon \approx 0$ en `(3, 3)` (que tiene el menor costo $c'_{33} = 5$ y no cierra ciclo). Ya hay `5` básicas.
4. **Verificación MODI (sobre $c'_{ij}$):**
   - Con $u_1 = 0$: $v_1 = 7$, $v_3 = 9$, $u_2 = -7$, $u_3 = 5 - 9 = -4$, $v_2 = 6 - (-4) = 10$.
   - Celdas vacías: $\Delta'_{12} = 10 - (0+10) = 0$ (indica óptimo alternativo), $\Delta'_{22} = 5 - (-7+10) = +2$, $\Delta'_{23} = 3 - (-7+9) = +1$, $\Delta'_{31} = 12 - (-4+7) = +9$.
   - Todas $\ge 0$. **Ganancia máxima real:**
     $$Z_{\max} = (70 \times 8) + (50 \times 6) + (80 \times 15) + (80 \times 9) = 560 + 300 + 1200 + 720 = \mathbf{2780}$$

---

### Caso 4: Rutas Prohibidas y Desbalanceo (3x3 con $M$, Minimización)

| Origen \ Destino | Zona A | Zona B | Zona C | Oferta |
| --- | :---: | :---: | :---: | :---: |
| **Centro Norte** | **M** | 6 | 4 | **30** |
| **Centro Sur** | 5 | 3 | **M** | **45** |
| **Centro Este** | 7 | 4 | 2 | **35** |
| **Demanda** | **35** | **30** | **25** | **110 vs 90** |

1. **Balanceo:** $\sum a_i = 110 > \sum b_j = 90$. Se agrega **Destino Ficticio** con demanda $110 - 90 = 20$ y costo `0` en las 3 filas.
2. **Por qué fallan Noroeste y Costo Mínimo sin MODI:**
   - Esquina Noroeste empieza en `(Norte, Zona A)` que es **M** (infactible).
   - Costo Mínimo empieza por los `0` del Destino Ficticio, pero puede verse forzado a usar una ruta `M` al final si no penaliza adecuadamente.
   - Al aplicar **MODI** con penalización $M$ grande, el ciclo cerrado expulsa el flujo de las rutas `M` y converge al óptimo factible:
     - $x_{\text{Norte, Zona C}} = 10 \times 4 = 40$
     - $x_{\text{Norte, Ficticio}} = 20 \times 0 = 0$
     - $x_{\text{Sur, Zona A}} = 35 \times 5 = 175$
     - $x_{\text{Sur, Zona B}} = 10 \times 3 = 30$
     - $x_{\text{Este, Zona B}} = 20 \times 4 = 80$
     - $x_{\text{Este, Zona C}} = 15 \times 2 = 30$
   - **Óptimo global factible:** $Z_{\min} = 40 + 0 + 175 + 30 + 80 + 30 = \mathbf{355}$.

---

## 6. Lista de Chequeo para Verificar que el Sistema lo Hace Bien

Para comprobar a mano cualquier resultado arrojado por el sistema:
1. **Suma de filas:** Verifica que cada fila sume exactamente su oferta $a_i$.
2. **Suma de columnas:** Verifica que cada columna sume exactamente su demanda $b_j$.
3. **Celdas básicas:** Cuenta las celdas básicas (incluyendo $\varepsilon$ si hubo degeneración); debe ser exactamente $m + n - 1$ sobre la tabla ya balanceada.
4. **Rutas prohibidas:** Confirma que ninguna celda marcada con `M` tenga envío positivo ($x_{ij} > 0$).
5. **Multiplicadores en el último paso MODI:** Verifica que en todas las celdas asignadas se cumpla $u_i + v_j = c_{ij}$ (o $c'_{ij}$ en maximización) y que en todas las celdas vacías $\Delta_{ij} = c_{ij} - (u_i + v_j) \ge 0$.
