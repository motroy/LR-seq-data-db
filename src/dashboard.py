import panel as pn
import pandas as pd
import hvplot.pandas

pn.extension(sizing_mode="stretch_width")

import os

@pn.cache
def get_data():
    # Construct the path to the data file relative to this script's location
    data_path = os.path.join(os.getcwd(), 'public', 'dashboard_data.json')
    return pd.read_json(data_path)

data = get_data()

organism_filter = pn.widgets.CrossSelector(name="Search by Organism", options=sorted(data['scientific_name'].unique().tolist()))
platform_filter = pn.widgets.Select(name="Filter by Platform", options=['All'] + sorted(data['instrument_platform'].unique().tolist()))

@pn.depends(organism_filter.param.value, platform_filter.param.value)
def filtered_data(organisms, platform):
    df = data.copy()
    if organisms:
        df = df[df['scientific_name'].isin(organisms)]
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
    organism_filter,
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
