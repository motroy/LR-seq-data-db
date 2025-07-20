importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.7.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.7.4/dist/wheels/panel-1.7.4-py3-none-any.whl', 'pyodide-http==0.2.1', 'hvplot', 'pandas', 'openpyxl']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  \nimport asyncio\n\nfrom panel.io.pyodide import init_doc, write_doc\n\ninit_doc()\n\nimport panel as pn\nimport pandas as pd\nimport hvplot.pandas\n\npn.extension(sizing_mode="stretch_width")\n\nimport os\n\n@pn.cache\ndef get_data():\n    # Construct the path to the data file relative to this script's location\n    data_path = os.path.join(os.getcwd(), 'public', 'dashboard_data.json')\n    return pd.read_json(data_path)\n\ndata = get_data()\n\ncolumns = data.columns.tolist()\n\nsearch_term = pn.widgets.MultiChoice(name="Search by Organism", options=sorted(data['scientific_name'].unique().tolist()))\nplatform_filter = pn.widgets.Select(name="Filter by Platform", options=['All'] + sorted(data['instrument_platform'].unique().tolist()))\ncolumn_selector = pn.widgets.MultiChoice(name='Select Columns', options=columns, value=columns)\n\n
@pn.depends(search_term.param.value, platform_filter.param.value)\ndef filtered_data(search, platform):\n    df = data.copy()\n    if search:\n        df = df[df['scientific_name'].isin(search)]\n    if platform and platform != 'All':\n        df = df[df['instrument_platform'] == platform]\n    return df\n\ndef get_data_table(df, columns):\n    return pn.widgets.DataFrame(df[columns], height=400, sizing_mode="stretch_width")\n\ndef get_data_charts(df):\n    if df.empty:\n        return pn.pane.Markdown("No data to display.")\n\n    # Chart 1: Read Count by Platform\n    read_count_chart = df.hvplot.bar(\n        x='instrument_platform',\n        y='read_count',\n        title='Total Read Count by Platform',\n        rot=45\n    ).opts(responsive=True)\n\n    # Chart 2: Base Count by Platform\n    base_count_chart = df.hvplot.bar(\n        x='instrument_platform',\n        y='base_count',\n        title='Total Base Count by Platform',\n        rot=45\n    ).opts(responsive=True)\n\n    return pn.Column(read_count_chart, base_count_chart)\n\n\nwidgets = pn.Column(\n    "### Filters",\n    search_term,\n    platform_filter,\n    column_selector\n)\n\n\nfrom io import BytesIO\n\ndef download_tsv(event):\n    df = filtered_data()\n    sio = BytesIO()\n    df.to_csv(sio, sep='\\t', index=False)\n    sio.seek(0)\n    return pn.widgets.FileDownload(sio, filename='data.tsv', button_type='primary')\n\ndef download_excel(event):\n    df = filtered_data()\n    sio = BytesIO()\n    df.to_excel(sio, index=False, sheet_name='Sheet1')\n    sio.seek(0)\n    return pn.widgets.FileDownload(sio, filename='data.xlsx', button_type='primary')\n\ndownload_tsv_button = pn.widgets.Button(name='Download as TSV')\ndownload_tsv_button.on_click(download_tsv)\n\ndownload_excel_button = pn.widgets.Button(name='Download as Excel')\ndownload_excel_button.on_click(download_excel)\n\n\nbound_charts = pn.bind(get_data_charts, df=filtered_data)\nbound_table = pn.bind(get_data_table, df=filtered_data, columns=column_selector.param.value)\n\ndashboard_layout = pn.Column(\n    "# Genomic Data Dashboard",\n    pn.Row(\n        pn.Column(widgets, sizing_mode="fixed", width=300),\n        pn.Column(\n            "### Charts",\n            bound_charts,\n            "### Data Table",\n            bound_table,\n            pn.Row(download_tsv_button, download_excel_button)\n        )\n    )\n)\n\ndashboard_layout.servable()\n\n\nawait write_doc()\n  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    from panel.io.pyodide import _convert_json_patch
    state.curdoc.apply_json_patch(_convert_json_patch(patch), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()