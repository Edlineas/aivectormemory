from .v01 import upgrade as v01
from .v02 import upgrade as v02
from .v03 import upgrade as v03
from .v04 import upgrade as v04
from .v05 import upgrade as v05
from .v06 import upgrade as v06
from .v07 import upgrade as v07
from .v08 import upgrade as v08
from .v09 import upgrade as v09
from .v10 import upgrade as v10
from .v11 import upgrade as v11

MIGRATIONS = {
    1: v01,
    2: v02,
    3: v03,
    4: v04,
    5: v05,
    6: v06,
    7: v07,
    8: v08,
    9: v09,
    10: v10,
    11: v11,
}
