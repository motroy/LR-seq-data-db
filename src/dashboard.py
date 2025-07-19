import panel as pn
import pandas as pd
import hvplot.pandas

pn.extension(sizing_mode="stretch_width")

@pn.cache
def get_data():
    return pd.read_json('public/dashboard_data.json')

data = get_data()

search_term = pn.widgets.TextInput(name="Search by Organism", placeholder="Enter search term...")
platform_filter = pn.widgets.Select(name="Filter by Platform", options=['All'] + sorted(data['instrument_platform'].unique().tolist()))

@pn.depends(search_term.param.value, platform_filter.param.value)
def filtered_data(search, platform):
    df = data.copy()
    if search:
        df = df[df['scientific_name'].str.contains(search, case=False)]
    if platform and platform != 'All':
        df = df[df['instrument_platform'] == platform]
    return df

def get_data_table(df):
    return pn.widgets.DataFrame(df, height=400, sizing_mode="stretch_width")

def get_data_charts(df):
    if df.empty:
        return pn.pane.Markdown("No data to display.")

    # Chart 1: Read Count by Platform
    read_count_chart = df.hvplot.bar(
        x='instrument_platform',
        y='read_count',
        title='Total Read Count by Platform',
        rot=45
    ).opts(responsive=True)

    # Chart 2: Base Count by Platform
    base_count_chart = df.hvplot.bar(
        x='instrument_platform',
        y='base_count',
        title='Total Base Count by Platform',
        rot=45
    ).opts(responsive=True)

    return pn.Column(read_count_chart, base_count_chart)


widgets = pn.Column(
    "### Filters",
    search_term,
    platform_filter
)

bound_charts = pn.bind(get_data_charts, df=filtered_data)
bound_table = pn.bind(get_data_table, df=filtered_data)

dashboard_layout = pn.Column(
    "# Genomic Data Dashboard",
    pn.Row(
        pn.Column(widgets, sizing_mode="fixed", width=300),
        pn.Column(
            "### Charts",
            bound_charts,
            "### Data Table",
            bound_table
        )
    )
)

dashboard_layout.servable()
