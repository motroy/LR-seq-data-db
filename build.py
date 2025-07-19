import panel as pn
from src.dashboard import dashboard_layout

dashboard_layout.save("public/dashboard/dashboard.html", embed=True)
